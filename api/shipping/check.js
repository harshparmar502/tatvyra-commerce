/**
 * GET /api/shipping/check?pin=400001
 * -> { serviceable, etaDays, etd }
 */
import { HttpError, json, route } from '../_lib/http.js'
import { checkServiceability } from '../_lib/shiprocket.js'

export const GET = route(async (request) => {
  const pin = new URL(request.url).searchParams.get('pin') ?? ''
  if (!/^\d{6}$/.test(pin)) throw new HttpError(400, 'bad_pin', 'Enter a 6-digit PIN code.')
  return json(await checkServiceability(pin))
})
