/**
 * GET /api/products/live
 * -> { variants: { [sku]: { price, mrp, available } }, updatedAt }
 *
 * Live selling price, MRP (compare-at price) and stock for every Tatvyra
 * variant in Shopify, so a change made in the Shopify admin shows on the
 * website without a code change. Display only — the checkout prices the cart
 * again from Shopify itself (api/_lib/checkout.js).
 *
 * Cached at Vercel's edge for 60 seconds, so Shopify is asked at most about
 * once a minute however busy the site is.
 */
import { route } from '../_lib/http.js'
import { shopify } from '../_lib/shopify.js'

const QUERY = /* GraphQL */ `
  query LiveVariants($after: String) {
    productVariants(first: 250, after: $after) {
      nodes {
        sku
        price
        compareAtPrice
        inventoryQuantity
        inventoryPolicy
        inventoryItem { tracked }
        product { status }
      }
      pageInfo { hasNextPage endCursor }
    }
  }
`

export const GET = route(async () => {
  const variants = {}
  let after = null
  for (let page = 0; page < 4; page += 1) {
    const { productVariants } = await shopify(QUERY, { after })
    for (const v of productVariants.nodes) {
      if (!v.sku?.startsWith('TAT-')) continue
      const inStock =
        !v.inventoryItem?.tracked || v.inventoryPolicy === 'CONTINUE' || (v.inventoryQuantity ?? 0) > 0
      variants[v.sku] = {
        price: Number(v.price),
        mrp: v.compareAtPrice ? Number(v.compareAtPrice) : null,
        available: v.product.status === 'ACTIVE' && inStock,
      }
    }
    if (!productVariants.pageInfo.hasNextPage) break
    after = productVariants.pageInfo.endCursor
  }

  return new Response(JSON.stringify({ variants, updatedAt: new Date().toISOString() }), {
    headers: {
      'content-type': 'application/json',
      'cache-control': 'public, max-age=0, s-maxage=60, stale-while-revalidate=300',
    },
  })
})
