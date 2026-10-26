/**
 * Shopify Admin GraphQL client.
 *
 * Two ways to authenticate, use whichever your app gives you:
 *   SHOPIFY_ADMIN_TOKEN                        a fixed "shpat_..." Admin API token
 *   SHOPIFY_CLIENT_ID + SHOPIFY_CLIENT_SECRET  an app from the Shopify Dev Dashboard,
 *                                              exchanged for a short-lived token
 *                                              (client credentials grant)
 *
 * Required app scopes: write_draft_orders, read_orders, write_orders,
 * read_products, read_inventory, and write_products (only for the product
 * sync script).
 */
import { env, HttpError } from './http.js'

/* Settings are often pasted with stray spaces, quotes or a full URL. Accept
   all of those rather than failing with an unreadable error. */
const clean = (value) => (value ?? '').trim().replace(/^["']|["']$/g, '').trim()

const apiVersion = () => clean(process.env.SHOPIFY_API_VERSION) || '2026-10'

/** "https://demo.myshopify.com/" -> "demo.myshopify.com" */
function storeDomain() {
  const domain = clean(env('SHOPIFY_STORE_DOMAIN'))
    .replace(/^https?:\/\//i, '')
    .replace(/\/.*$/, '')
    .toLowerCase()
  if (!/^[a-z0-9-]+\.myshopify\.com$/.test(domain)) {
    throw new HttpError(
      503,
      'not_configured',
      'SHOPIFY_STORE_DOMAIN must look like your-store.myshopify.com (no https://, no admin.shopify.com).',
    )
  }
  return domain
}

/** Fetch that turns a network failure into a readable error instead of a crash. */
async function request(url, init) {
  try {
    return await fetch(url, init)
  } catch (error) {
    throw new HttpError(502, 'shopify_unreachable', `Could not reach Shopify (${error.cause?.code ?? error.message}).`)
  }
}

let cachedToken = null // { token, expiresAt }

async function accessToken() {
  const fixed = clean(process.env.SHOPIFY_ADMIN_TOKEN)
  if (fixed) {
    if (!/^shpat_[A-Za-z0-9]+$/.test(fixed)) {
      throw new HttpError(503, 'not_configured', 'SHOPIFY_ADMIN_TOKEN should start with shpat_ and contain no spaces.')
    }
    return fixed
  }
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) return cachedToken.token

  const shop = storeDomain()
  const res = await request(`https://${shop}/admin/oauth/access_token`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: clean(env('SHOPIFY_CLIENT_ID')),
      client_secret: clean(env('SHOPIFY_CLIENT_SECRET')),
    }),
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok || !body.access_token) {
    throw new HttpError(502, 'shopify_auth', `Shopify sign-in failed (${res.status}).`)
  }
  cachedToken = {
    token: body.access_token,
    expiresAt: Date.now() + (Number(body.expires_in) || 3600) * 1000,
  }
  return cachedToken.token
}

export async function shopify(query, variables = {}) {
  const shop = storeDomain()
  const res = await request(`https://${shop}/admin/api/${apiVersion()}/graphql.json`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'X-Shopify-Access-Token': await accessToken(),
    },
    body: JSON.stringify({ query, variables }),
  })
  const body = await res.json().catch(() => ({}))
  if (res.status === 401 || res.status === 403) {
    throw new HttpError(502, 'shopify_auth', `Shopify rejected the token (${res.status}). Check SHOPIFY_ADMIN_TOKEN and the app's scopes.`)
  }
  if (!res.ok || body.errors) {
    const detail = body.errors ? JSON.stringify(body.errors).slice(0, 500) : res.statusText
    throw new HttpError(502, 'shopify_error', `Shopify request failed (${res.status}): ${detail}`)
  }
  return body.data
}

/** Throws when a mutation came back with userErrors. */
export function assertNoUserErrors(errors, what) {
  if (errors?.length) {
    const detail = errors.map((e) => e.message).join('; ')
    throw new HttpError(502, 'shopify_error', `${what} failed: ${detail}`)
  }
}
