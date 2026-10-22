/**
 * Razorpay REST client. Plain fetch, no SDK.
 *
 *   RAZORPAY_KEY_ID          rzp_test_... or rzp_live_...  (also sent to the browser)
 *   RAZORPAY_KEY_SECRET      never leaves the server
 *   RAZORPAY_WEBHOOK_SECRET  the secret you set on the webhook in the Razorpay dashboard
 */
import { createHmac, timingSafeEqual } from 'node:crypto'
import { env, HttpError } from './http.js'

const BASE = 'https://api.razorpay.com/v1'

async function call(path, init = {}) {
  const auth = Buffer.from(`${env('RAZORPAY_KEY_ID')}:${env('RAZORPAY_KEY_SECRET')}`).toString('base64')
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { 'content-type': 'application/json', authorization: `Basic ${auth}`, ...init.headers },
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) {
    const detail = body?.error?.description ?? res.statusText
    throw new HttpError(502, 'razorpay_error', `Razorpay request failed (${res.status}): ${detail}`)
  }
  return body
}

/** amount is in paise. notes: up to 15 string values of 256 characters. */
export const createOrder = ({ amount, receipt, notes }) =>
  call('/orders', { method: 'POST', body: JSON.stringify({ amount, currency: 'INR', receipt, notes }) })

export const fetchOrder = (id) => call(`/orders/${encodeURIComponent(id)}`)

export const fetchPayment = (id) => call(`/payments/${encodeURIComponent(id)}`)

export const capturePayment = (id, amount) =>
  call(`/payments/${encodeURIComponent(id)}/capture`, {
    method: 'POST',
    body: JSON.stringify({ amount, currency: 'INR' }),
  })

function safeEqualHex(expected, received) {
  if (typeof received !== 'string') return false
  const a = Buffer.from(expected, 'utf8')
  const b = Buffer.from(received, 'utf8')
  return a.length === b.length && timingSafeEqual(a, b)
}

/** The signature Razorpay Checkout hands the browser after a successful payment. */
export function verifyCheckoutSignature({ orderId, paymentId, signature }) {
  const expected = createHmac('sha256', env('RAZORPAY_KEY_SECRET'))
    .update(`${orderId}|${paymentId}`)
    .digest('hex')
  return safeEqualHex(expected, signature)
}

/** The X-Razorpay-Signature header on a webhook, computed over the raw body. */
export function verifyWebhookSignature(rawBody, signature) {
  const expected = createHmac('sha256', env('RAZORPAY_WEBHOOK_SECRET')).update(rawBody).digest('hex')
  return safeEqualHex(expected, signature)
}
