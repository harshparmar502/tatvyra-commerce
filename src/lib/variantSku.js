/**
 * The SKU a product + pack size carries in Shopify.
 *
 * The site keeps its own rich catalogue (src/data/catalogue.js) for display,
 * and Shopify holds the sellable variants. This is the one rule joining them:
 *
 *   single-size product   TAT-MO01
 *   multi-size product    TAT-NB01-250G, TAT-NB01-500G, TAT-NB01-1000G
 *
 * scripts/shopify-sync-products.mjs creates the Shopify products with exactly
 * these SKUs. If you add variants in the Shopify admin by hand, use the same
 * pattern or the checkout will not find them.
 */
export function variantSku(product, size) {
  if (!product.sizes || product.sizes.length <= 1) return product.sku
  return `${product.sku}-${String(size).replace(/\s+/g, '').toUpperCase()}`
}
