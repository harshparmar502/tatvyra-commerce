/**
 * The checkout, server side.
 *
 *   1. quote()        cart + address -> Shopify draft order (Shopify's prices,
 *                     our delivery rule) -> Razorpay order for that exact total.
 *                     The draft order id rides along in the Razorpay order's notes.
 *   2. Customer pays in the Razorpay window.
 *   3. completePaid() runs from BOTH the browser (/api/checkout/verify) and the
 *                     Razorpay webhook, whichever arrives first. It checks the
 *                     payment with Razorpay, then completes the draft into a
 *                     paid Shopify order. Running it twice is harmless.
 *   4. Shiprocket picks the paid order up from Shopify through its Shopify
 *      channel integration.
 *
 * Prices always come from Shopify, never from the browser.
 */
import { getProduct } from '../../src/data/catalogue.js'
import { variantSku } from '../../src/lib/variantSku.js'
import { deliveryFor } from '../../src/lib/shipping.js'
import { validateDelivery } from '../../src/lib/deliveryDetails.js'
import { HttpError } from './http.js'
import { assertNoUserErrors, shopify } from './shopify.js'
import * as razorpay from './razorpay.js'

const MAX_LINES = 30
const MAX_QUANTITY = 20

const toPaise = (amount) => Math.round(Number.parseFloat(amount) * 100)
const toRupees = (paise) => paise / 100

/** Checks the browser's cart lines against the site catalogue. */
function normaliseLines(lines) {
  if (!Array.isArray(lines) || lines.length === 0 || lines.length > MAX_LINES) {
    throw new HttpError(400, 'bad_cart', 'Your cart is empty or could not be read.')
  }
  const merged = new Map()
  for (const line of lines) {
    const product = getProduct(line?.slug)
    const size = line?.size ?? product?.sizes?.[0]
    const quantity = Number(line?.quantity)
    if (!product || !product.sizes.includes(size)) {
      throw new HttpError(400, 'bad_cart', 'An item in your cart is no longer available.')
    }
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > MAX_QUANTITY) {
      throw new HttpError(400, 'bad_cart', `Quantities must be between 1 and ${MAX_QUANTITY}.`)
    }
    const sku = variantSku(product, size)
    const existing = merged.get(sku)
    merged.set(sku, {
      sku,
      slug: product.slug,
      name: product.name,
      size,
      quantity: (existing?.quantity ?? 0) + quantity,
    })
  }
  return [...merged.values()]
}

function normaliseCustomer(customer) {
  const errors = validateDelivery(customer ?? {})
  if (Object.keys(errors).length > 0) {
    throw new HttpError(400, 'bad_address', Object.values(errors)[0])
  }
  const s = (v) => (typeof v === 'string' ? v.trim() : '')
  return {
    name: s(customer.name),
    email: s(customer.email),
    phone: customer.phone.replace(/\D/g, ''),
    address: s(customer.address),
    address2: s(customer.address2),
    city: s(customer.city),
    state: s(customer.state),
    pin: s(customer.pin),
  }
}

const VARIANTS_QUERY = /* GraphQL */ `
  query VariantsBySku($query: String!, $first: Int!) {
    productVariants(first: $first, query: $query) {
      nodes {
        id
        sku
        price
        inventoryQuantity
        inventoryPolicy
        inventoryItem { tracked }
      }
    }
  }
`

async function findVariants(skus) {
  const query = skus.map((sku) => `sku:"${sku}"`).join(' OR ')
  const data = await shopify(VARIANTS_QUERY, { query, first: Math.min(skus.length * 3, 100) })
  const bySku = new Map()
  for (const node of data.productVariants.nodes) {
    // Search is fuzzy; only an exact SKU match counts.
    if (skus.includes(node.sku) && !bySku.has(node.sku)) bySku.set(node.sku, node)
  }
  return bySku
}

const DRAFT_CREATE = /* GraphQL */ `
  mutation DraftCreate($input: DraftOrderInput!) {
    draftOrderCreate(input: $input) {
      draftOrder {
        id
        name
        taxesIncluded
        subtotalPriceSet { shopMoney { amount } }
        totalShippingPriceSet { shopMoney { amount } }
        totalTaxSet { shopMoney { amount } }
        totalPriceSet { shopMoney { amount currencyCode } }
      }
      userErrors { field message }
    }
  }
`

function splitName(full) {
  const parts = full.split(/\s+/)
  if (parts.length === 1) return { firstName: '', lastName: parts[0] }
  return { firstName: parts.slice(0, -1).join(' '), lastName: parts.at(-1) }
}

/**
 * Prices the cart in Shopify and opens a Razorpay order for that total.
 * Returns what the browser needs to open Razorpay Checkout and show the
 * summary it is about to pay for.
 */
export async function quote({ reference, lines, customer }) {
  if (typeof reference !== 'string' || !/^TAT-[A-Z0-9]{6}$/.test(reference)) {
    throw new HttpError(400, 'bad_request', 'Missing order reference.')
  }
  const items = normaliseLines(lines)
  const who = normaliseCustomer(customer)

  const variants = await findVariants(items.map((i) => i.sku))
  const priced = items.map((item) => {
    const variant = variants.get(item.sku)
    const inStock =
      variant &&
      (!variant.inventoryItem?.tracked ||
        variant.inventoryPolicy === 'CONTINUE' ||
        (variant.inventoryQuantity ?? 0) >= item.quantity)
    if (!inStock) {
      if (!variant) console.error(`[api] no Shopify variant with SKU ${item.sku} — run the product sync`)
      throw new HttpError(
        409,
        'unavailable',
        `${item.name}${item.size ? ` (${item.size})` : ''} is out of stock right now. Please remove it and try again.`,
      )
    }
    const unitPaise = toPaise(variant.price)
    return { ...item, variantId: variant.id, unitPaise, linePaise: unitPaise * item.quantity }
  })

  const subtotalPaise = priced.reduce((sum, i) => sum + i.linePaise, 0)
  const delivery = deliveryFor(toRupees(subtotalPaise))
  const phone = `+91${who.phone}`
  const address = {
    ...splitName(who.name),
    address1: who.address,
    address2: who.address2 || null,
    city: who.city,
    province: who.state,
    zip: who.pin,
    countryCode: 'IN',
    phone,
  }

  const data = await shopify(DRAFT_CREATE, {
    input: {
      email: who.email,
      phone,
      shippingAddress: address,
      billingAddress: address,
      lineItems: priced.map((i) => ({ variantId: i.variantId, quantity: i.quantity })),
      shippingLine: {
        title: delivery > 0 ? 'Standard delivery' : 'Free delivery',
        priceWithCurrency: { amount: delivery.toFixed(2), currencyCode: 'INR' },
      },
      note: `Website order ${reference}`,
      tags: ['website', 'razorpay'],
      customAttributes: [{ key: 'website_reference', value: reference }],
    },
  })
  assertNoUserErrors(data.draftOrderCreate.userErrors, 'Creating the Shopify order')
  const draft = data.draftOrderCreate.draftOrder

  if (draft.totalPriceSet.shopMoney.currencyCode !== 'INR') {
    throw new HttpError(500, 'currency', 'The Shopify store currency must be INR.')
  }
  const totalPaise = toPaise(draft.totalPriceSet.shopMoney.amount)

  const rzOrder = await razorpay.createOrder({
    amount: totalPaise,
    receipt: reference,
    notes: { reference, draft_order_id: draft.id, draft_order_name: draft.name },
  })

  return {
    keyId: process.env.RAZORPAY_KEY_ID,
    razorpayOrderId: rzOrder.id,
    amountPaise: totalPaise,
    currency: 'INR',
    totals: {
      lines: priced.map((i) => ({
        id: `${i.slug}::${i.size}`,
        slug: i.slug,
        name: i.name,
        size: i.size,
        quantity: i.quantity,
        unitPrice: toRupees(i.unitPaise),
        lineTotal: toRupees(i.linePaise),
      })),
      subtotal: toRupees(toPaise(draft.subtotalPriceSet.shopMoney.amount)),
      delivery: toRupees(toPaise(draft.totalShippingPriceSet.shopMoney.amount)),
      tax: toRupees(toPaise(draft.totalTaxSet.shopMoney.amount)),
      taxesIncluded: draft.taxesIncluded,
      total: toRupees(totalPaise),
    },
  }
}

const DRAFT_READ = /* GraphQL */ `
  query DraftRead($id: ID!) {
    draftOrder(id: $id) {
      id
      status
      order { id name }
    }
  }
`

const DRAFT_COMPLETE = /* GraphQL */ `
  mutation DraftComplete($id: ID!) {
    draftOrderComplete(id: $id) {
      draftOrder {
        id
        status
        order { id name }
      }
      userErrors { field message }
    }
  }
`

const TAGS_ADD = /* GraphQL */ `
  mutation TagsAdd($id: ID!, $tags: [String!]!) {
    tagsAdd(id: $id, tags: $tags) {
      userErrors { message }
    }
  }
`

const METHOD_LABELS = {
  upi: 'UPI',
  card: 'Card',
  netbanking: 'Netbanking',
  wallet: 'Wallet',
  emi: 'EMI',
  paylater: 'Pay later',
}

/**
 * Confirms a Razorpay payment and turns its draft order into a paid Shopify
 * order. Safe to call more than once for the same payment.
 */
export async function completePaid({ razorpayOrderId, paymentId }) {
  const [rzOrder, payment] = await Promise.all([
    razorpay.fetchOrder(razorpayOrderId),
    razorpay.fetchPayment(paymentId),
  ])

  const draftId = rzOrder.notes?.draft_order_id
  if (!draftId) throw new HttpError(400, 'unknown_order', 'That payment is not linked to a website order.')
  if (payment.order_id !== razorpayOrderId || payment.amount !== rzOrder.amount) {
    throw new HttpError(400, 'mismatch', 'The payment does not match the order.')
  }

  if (payment.status === 'authorized') {
    // Only needed when auto-capture is off in the Razorpay dashboard.
    await razorpay.capturePayment(payment.id, payment.amount)
  } else if (payment.status !== 'captured') {
    throw new HttpError(402, 'not_paid', 'The payment has not gone through.')
  }

  let order = (await shopify(DRAFT_READ, { id: draftId })).draftOrder?.order
  if (!order) {
    const data = await shopify(DRAFT_COMPLETE, { id: draftId })
    order = data.draftOrderComplete.draftOrder?.order
    if (!order) {
      // Another call (browser or webhook) may have completed it a moment ago.
      order = (await shopify(DRAFT_READ, { id: draftId })).draftOrder?.order
      if (!order) assertNoUserErrors(data.draftOrderComplete.userErrors, 'Completing the Shopify order')
    }
    if (!order) throw new HttpError(502, 'shopify_error', 'Shopify did not return the new order.')
  }

  // Label the order with its payment every time; adding a tag twice is harmless.
  try {
    await shopify(TAGS_ADD, { id: order.id, tags: [`razorpay:${payment.id}`] })
  } catch (error) {
    console.error('[api] could not tag order with payment id', error)
  }

  return {
    reference: rzOrder.notes?.reference ?? null,
    paymentId: payment.id,
    method: METHOD_LABELS[payment.method] ?? payment.method,
    /* No status page link: Shopify only gives it to apps with customer-data
       access, which the Basic plan does not allow. */
    order: { name: order.name, statusPageUrl: null },
  }
}
