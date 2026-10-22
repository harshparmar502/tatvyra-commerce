/**
 * The delivery charge rule: free over a threshold, a flat fee below it.
 *
 * Shared by the cart (for the totals shown while shopping) and the server
 * (api/_lib/checkout.js, for the total actually charged), so the two can never
 * disagree. The two figures are placeholders until Tatvyra confirms its rates.
 */
export const FREE_DELIVERY_FROM = 999
export const DELIVERY_FLAT = 79

export function deliveryFor(subtotal) {
  return subtotal > 0 && subtotal < FREE_DELIVERY_FROM ? DELIVERY_FLAT : 0
}
