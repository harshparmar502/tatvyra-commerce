/**
 * Shiprocket client — used only to check that a PIN code is deliverable and
 * how long delivery takes.
 *
 * Creating shipments is NOT done here: connect Shopify as a sales channel
 * inside Shiprocket and every paid Shopify order syncs across on its own.
 * Doing both would create every shipment twice.
 *
 *   SHIPROCKET_EMAIL / SHIPROCKET_PASSWORD  an API user (Shiprocket > Settings > API)
 *   SHIPROCKET_PICKUP_PIN                   the PIN code of your pickup warehouse
 */
import { env, HttpError } from './http.js'

const BASE = 'https://apiv2.shiprocket.in/v1/external'
// Tokens last 10 days; refresh a day early.
const TOKEN_LIFETIME_MS = 9 * 24 * 60 * 60 * 1000

let cached = null // { token, at }

async function login() {
  const res = await fetch(`${BASE}/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: env('SHIPROCKET_EMAIL'), password: env('SHIPROCKET_PASSWORD') }),
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok || !body.token) {
    throw new HttpError(502, 'shiprocket_auth', `Shiprocket sign-in failed (${res.status}).`)
  }
  cached = { token: body.token, at: Date.now() }
  return cached.token
}

async function token() {
  if (cached && Date.now() - cached.at < TOKEN_LIFETIME_MS) return cached.token
  return login()
}

async function get(path) {
  let res = await fetch(`${BASE}${path}`, { headers: { authorization: `Bearer ${await token()}` } })
  if (res.status === 401) {
    cached = null
    res = await fetch(`${BASE}${path}`, { headers: { authorization: `Bearer ${await token()}` } })
  }
  return { status: res.status, body: await res.json().catch(() => ({})) }
}

/**
 * { serviceable, etaDays, etd } for a delivery PIN code.
 * weightKg is the parcel weight; 0.5 kg covers a typical one- or two-jar order.
 */
export async function checkServiceability(pin, { weightKg = 0.5, cod = false } = {}) {
  const params = new URLSearchParams({
    pickup_postcode: env('SHIPROCKET_PICKUP_PIN'),
    delivery_postcode: pin,
    weight: String(weightKg),
    cod: cod ? '1' : '0',
  })
  const { status, body } = await get(`/courier/serviceability/?${params}`)

  const couriers = body?.data?.available_courier_companies ?? []
  if (couriers.length === 0) {
    // Shiprocket answers an undeliverable PIN with a 404-style body.
    if (status >= 500) throw new HttpError(502, 'shiprocket_error', `Shiprocket returned ${status}.`)
    return { serviceable: false, etaDays: null, etd: null }
  }

  const fastest = couriers
    .map((c) => ({ days: Number(c.estimated_delivery_days), etd: c.etd ?? null }))
    .filter((c) => Number.isFinite(c.days))
    .sort((a, b) => a.days - b.days)[0]

  return { serviceable: true, etaDays: fastest?.days ?? null, etd: fastest?.etd ?? null }
}
