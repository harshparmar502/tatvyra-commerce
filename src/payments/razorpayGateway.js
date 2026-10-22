import { PaymentStatus } from './gateway'

/**
 * Razorpay, through the site's own /api functions.
 *
 * The browser never sees a secret and never decides a price: /api/checkout/create
 * prices the cart in Shopify and opens a Razorpay order, Razorpay's own window
 * collects the UPI / card / netbanking details, and /api/checkout/verify checks
 * the result and creates the paid Shopify order.
 *
 * `methods` is empty because Razorpay's window offers the methods itself; the
 * payment page shows a single "Pay" panel for a provider like this.
 */

const CHECKOUT_JS = 'https://checkout.razorpay.com/v1/checkout.js'
let scriptPromise = null

function loadCheckoutScript() {
  if (window.Razorpay) return Promise.resolve()
  if (!scriptPromise) {
    scriptPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script')
      script.src = CHECKOUT_JS
      script.async = true
      script.onload = () => resolve()
      script.onerror = () => {
        scriptPromise = null
        reject(new Error('Razorpay script failed to load'))
      }
      document.head.appendChild(script)
    })
  }
  return scriptPromise
}

async function post(path, body) {
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    const error = new Error(data.message || 'The payment service did not respond.')
    error.code = data.error || 'unavailable'
    throw error
  }
  return data
}

/* One Razorpay order per cart + address. Closing the window and pressing Pay
   again reuses it rather than opening a second Shopify draft order. */
let lastQuote = null // { key, quote }

const failed = (reference, method, code, message) => ({
  status: PaymentStatus.Failed,
  reference,
  method,
  code,
  message,
})

export const razorpayGateway = {
  id: 'razorpay',
  label: 'Razorpay',
  isDemo: false,
  methods: [],

  async pay({ amount, reference, lines, customer, onStage, onQuote }) {
    const stage = (text) => onStage?.(text)
    const method = 'razorpay'

    stage('Checking prices and stock')
    const key = JSON.stringify({ reference, lines, customer })
    let quote
    try {
      quote = lastQuote?.key === key ? lastQuote.quote : await post('/api/checkout/create', { reference, lines, customer })
      lastQuote = { key, quote }
      await loadCheckoutScript()
    } catch (error) {
      return failed(reference, method, error.code ?? 'unavailable', error.message)
    }

    onQuote?.(quote.totals)
    if (Math.abs(quote.totals.total - amount) > 0.005) {
      return failed(
        reference,
        method,
        'price_changed',
        'Prices were updated since you added these items. Please check the new total before paying.',
      )
    }

    stage('Complete the payment in the Razorpay window')
    const outcome = await new Promise((resolve) => {
      let lastError = null
      const checkout = new window.Razorpay({
        key: quote.keyId,
        order_id: quote.razorpayOrderId,
        amount: quote.amountPaise,
        currency: quote.currency,
        name: 'Tatvyra',
        description: `Order ${reference}`,
        image: `${window.location.origin}/brand/tatvyra-logo-mark.png`,
        prefill: { name: customer.name, email: customer.email, contact: customer.phone },
        notes: { reference },
        theme: { color: '#5a218a' },
        handler: (response) => resolve({ ok: true, response }),
        modal: {
          // Razorpay lets the customer retry inside its window after a
          // failure, so a failure only counts once they close it.
          ondismiss: () => resolve({ ok: false, error: lastError }),
        },
      })
      checkout.on('payment.failed', (response) => {
        lastError = response?.error ?? null
      })
      checkout.open()
    })

    if (!outcome.ok) {
      return outcome.error
        ? failed(
            reference,
            method,
            'declined',
            `${outcome.error.description || 'The payment did not go through.'} No money has been taken.`,
          )
        : failed(reference, method, 'dismissed', 'The payment window was closed. Nothing has been charged.')
    }

    stage('Confirming your order')
    try {
      const result = await post('/api/checkout/verify', outcome.response)
      lastQuote = null
      return {
        status: PaymentStatus.Succeeded,
        reference,
        method,
        methodLabel: result.method,
        order: result.order,
        paymentId: result.paymentId,
        totals: quote.totals,
        code: null,
        message: 'Payment received.',
      }
    } catch {
      /* The money has moved; the webhook will still create the order. Say so
         plainly rather than inviting a second payment. */
      return failed(
        reference,
        'razorpay',
        'confirm_pending',
        `Your payment went through but we could not confirm the order just now. Please don't pay again — email us with reference ${reference} and payment ID ${outcome.response.razorpay_payment_id}.`,
      )
    }
  },
}
