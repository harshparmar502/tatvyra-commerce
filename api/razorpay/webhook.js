/**
 * POST /api/razorpay/webhook
 *
 * The safety net: if the customer pays and then closes the tab before the
 * browser reaches /api/checkout/verify, this still turns the payment into a
 * Shopify order. In the Razorpay dashboard add a webhook pointing here, with
 * the "payment.captured" and "order.paid" events and RAZORPAY_WEBHOOK_SECRET
 * as its secret.
 */
import { completePaid } from '../_lib/checkout.js'
import { HttpError, json, route } from '../_lib/http.js'
import { verifyWebhookSignature } from '../_lib/razorpay.js'

const HANDLED = new Set(['payment.captured', 'order.paid'])

export const POST = route(async (request) => {
  const raw = await request.text()
  if (!verifyWebhookSignature(raw, request.headers.get('x-razorpay-signature'))) {
    throw new HttpError(400, 'bad_signature', 'Invalid webhook signature.')
  }

  const event = JSON.parse(raw)
  if (!HANDLED.has(event.event)) return json({ ignored: event.event })

  const payment = event.payload?.payment?.entity
  // Payments that were not made through the website checkout have no order.
  if (!payment?.order_id) return json({ ignored: 'no order' })

  try {
    const result = await completePaid({ razorpayOrderId: payment.order_id, paymentId: payment.id })
    return json({ ok: true, order: result.order.name })
  } catch (error) {
    // Not a website order (no draft id in its notes): acknowledge, don't retry.
    if (error instanceof HttpError && error.code === 'unknown_order') return json({ ignored: 'not ours' })
    throw error // anything else returns 5xx so Razorpay retries later
  }
})
