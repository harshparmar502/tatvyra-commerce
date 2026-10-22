/**
 * Creates or updates the Tatvyra products in Shopify from src/data/catalogue.js.
 *
 *   node --env-file=.env.local scripts/shopify-sync-products.mjs           # dry run: prints the plan
 *   node --env-file=.env.local scripts/shopify-sync-products.mjs --apply   # writes to Shopify
 *
 * Needs Node 20.6+ and SHOPIFY_STORE_DOMAIN plus a token (see .env.example),
 * with the write_products scope.
 *
 * For each product it sets: title, handle (= the site slug), one "Size" option,
 * and one variant per size with
 *   price            the site's selling price (priceFor)
 *   compare-at price the MRP shown struck through (mrpFor)
 *   SKU              variantSku() — what the checkout looks variants up by
 *   weight           parsed from sizes like "250g"; set the rest in Shopify
 *
 * The description is only written when the product is first created, so edits
 * made in the Shopify admin are not overwritten. Stock levels are never
 * touched: set them in Shopify, or the checkout will report items as out of
 * stock.
 */
import { CATEGORIES, mrpFor, priceFor, PRODUCTS } from '../src/data/catalogue.js'
import { variantSku } from '../src/lib/variantSku.js'
import { assertNoUserErrors, shopify } from '../api/_lib/shopify.js'

const apply = process.argv.includes('--apply')

const FIND = /* GraphQL */ `
  query Find($query: String!) {
    products(first: 1, query: $query) { nodes { id handle } }
  }
`

const SET = /* GraphQL */ `
  mutation Sync($input: ProductSetInput!) {
    productSet(input: $input, synchronous: true) {
      product { id handle }
      userErrors { field message }
    }
  }
`

const grams = (size) => {
  const match = /^(\d+(?:\.\d+)?)\s*g\b/i.exec(size)
  return match ? Number(match[1]) : null
}

const money = (n) => (n === null ? null : n.toFixed(2))

function variantsFor(product) {
  return product.sizes.map((size) => {
    const weight = grams(size)
    return {
      optionValues: [{ optionName: 'Size', name: size }],
      price: money(priceFor(product, size)),
      compareAtPrice: money(mrpFor(product, size)),
      inventoryPolicy: 'DENY',
      taxable: true,
      inventoryItem: {
        sku: variantSku(product, size),
        tracked: true,
        requiresShipping: true,
        ...(weight ? { measurement: { weight: { unit: 'GRAMS', value: weight } } } : {}),
      },
    }
  })
}

let failures = 0

for (const product of PRODUCTS) {
  const existing = (await shopify(FIND, { query: `handle:${product.slug}` })).products.nodes.find(
    (p) => p.handle === product.slug,
  )
  const variants = variantsFor(product)

  console.log(`${existing ? 'update' : 'create'}  ${product.name}`)
  for (const v of variants) {
    console.log(
      `        ${v.inventoryItem.sku.padEnd(18)} ${v.optionValues[0].name.padEnd(18)} ₹${v.price}  (MRP ₹${v.compareAtPrice})`,
    )
  }
  if (!apply) continue

  const input = {
    ...(existing ? { id: existing.id } : {}),
    title: product.name,
    handle: product.slug,
    vendor: 'Tatvyra',
    productType: CATEGORIES.find((c) => c.slug === product.category)?.name ?? '',
    status: 'ACTIVE',
    ...(existing ? {} : { descriptionHtml: `<p>${product.descriptor ?? ''}</p>` }),
    productOptions: [{ name: 'Size', values: product.sizes.map((name) => ({ name })) }],
    variants,
  }

  try {
    const data = await shopify(SET, { input })
    assertNoUserErrors(data.productSet.userErrors, product.name)
  } catch (error) {
    failures += 1
    console.error(`        FAILED: ${error.message}`)
  }
}

console.log(
  apply
    ? `\nDone. ${PRODUCTS.length - failures} synced, ${failures} failed.`
    : '\nDry run only. Re-run with --apply to write these to Shopify.',
)
process.exitCode = failures ? 1 : 0
