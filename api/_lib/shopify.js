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

const apiVersion = () => process.env.SHOPIFY_API_VERSION || '2026-10'

let cachedToken = null // { token, expiresAt }

async function accessToken() {
  if (process.env.SHOPIFY_ADMIN_TOKEN) return process.env.SHOPIFY_ADMIN_TOKEN
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) return cachedToken.token

  const shop = env('SHOPIFY_STORE_DOMAIN')
  const res = await fetch(`https://${shop}/admin/oauth/access_token`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: env('SHOPIFY_CLIENT_ID'),
      client_secret: env('SHOPIFY_CLIENT_SECRET'),
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
  const shop = env('SHOPIFY_STORE_DOMAIN')
  const res = await fetch(`https://${shop}/admin/api/${apiVersion()}/graphql.json`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'X-Shopify-Access-Token': await accessToken(),
    },
    body: JSON.stringify({ query, variables }),
  })
  const body = await res.json().catch(() => ({}))
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
