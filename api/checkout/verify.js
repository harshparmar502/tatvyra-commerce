/**
 * POST /api/checkout/verify
 * { razorpay_order_id, razorpay_payment_id, razorpay_signature }  — exactly what
 * Razorpay Checkout hands the browser on success.
 * -> { reference, paymentId, method, order: { name, statusPageUrl } }
 */
import { completePaid } from '../_lib/checkout.js'
import { HttpError, json, readJson, route } from '../_lib/http.js'
import { verifyCheckoutSignature } from '../_lib/razorpay.js'

export const POST = route(async (request) => {
  const body = await readJson(request)
  const orderId = body.razorpay_order_id
  const paymentId = body.razorpay_payment_id

  if (!verifyCheckoutSignature({ orderId, paymentId, signature: body.razorpay_signature })) {
    throw new HttpError(400, 'bad_signature', 'We could not verify that payment.')
  }
  return json(await completePaid({ razorpayOrderId: orderId, paymentId }))
})
