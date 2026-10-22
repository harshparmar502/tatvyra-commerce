/**
 * POST /api/checkout/create
 * { reference, lines: [{ slug, size, quantity }], customer: { name, email, ... } }
 * -> { keyId, razorpayOrderId, amountPaise, currency, totals }
 */
import { quote } from '../_lib/checkout.js'
import { json, readJson, route } from '../_lib/http.js'

export const POST = route(async (request) => {
  const body = await readJson(request)
  return json(await quote(body))
})
