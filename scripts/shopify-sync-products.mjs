/**
 * Creates or updates the Tatvyra products in Shopify from src/data/catalogue.js.
 *
 *   npm run shopify:sync                          dry run: prints the plan, writes nothing
 *   npm run shopify:sync -- --apply               create new products; update sizes, prices, SKUs
 *   npm run shopify:sync -- --apply --content     ...and also (re)write descriptions, tags and SEO
 *
 * Needs Node 20.6+, SHOPIFY_STORE_DOMAIN and a token (see .env.example) with
 * the write_products scope.
 *
 * Always kept in step with the website, on every --apply:
 *   title, handle (= the site slug), vendor, type, one "Size" option, and per size:
 *   price (priceFor), compare-at price (mrpFor), SKU (variantSku — the checkout
 *   finds products by it) and weight (parsed from sizes like "250g").
 *
 * Content — description (descriptor + benefits + "Why moringa/spirulina"),
 * tags and SEO — is written when a product is created, and afterwards only
 * with --content, so edits made in the Shopify admin are not overwritten by
 * accident.
 *
 * Images are uploaded from the live site (SITE_URL, default
 * https://www.tatvyra.com) only when the Shopify product has no images yet,
 * so re-running never duplicates them.
 *
 * Stock levels are never touched: set them in Shopify.
 */
import { benefitsFor, CATEGORIES, mrpFor, priceFor, PRODUCTS } from '../src/data/catalogue.js'
import { variantSku } from '../src/lib/variantSku.js'
import { assertNoUserErrors, shopify } from '../api/_lib/shopify.js'

const apply = process.argv.includes('--apply')
const writeContent = process.argv.includes('--content')
const SITE_URL = (process.env.SITE_URL || 'https://www.tatvyra.com').replace(/\/$/, '')

const FIND = /* GraphQL */ `
  query Find($query: String!) {
    products(first: 1, query: $query) {
      nodes { id handle mediaCount { count } }
    }
  }
`

const SET = /* GraphQL */ `
  mutation Sync($input: ProductSetInput!) {
    productSet(input: $input, synchronous: true) {
      product { id handle mediaCount { count } }
      userErrors { field message }
    }
  }
`

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

const grams = (size) => {
  const match = /^(\d+(?:\.\d+)?)\s*g\b/i.exec(size)
  return match ? Number(match[1]) : null
}

const money = (n) => (n === null ? null : n.toFixed(2))

function descriptionFor(product, category) {
  const parts = [`<p>${esc(product.descriptor ?? '')}</p>`]
  const { items } = benefitsFor(product)
  if (items.length) {
    parts.push('<h3>Key benefits</h3>', `<ul>${items.map((b) => `<li>${esc(b)}</li>`).join('')}</ul>`)
  }
  if (category?.highlights) {
    parts.push(
      `<h3>${esc(category.highlights.title)}</h3>`,
      `<ul>${category.highlights.points.map((b) => `<li>${esc(b)}</li>`).join('')}</ul>`,
    )
  }
  return parts.join('')
}

function imagesFor(product) {
  const list = product.images?.length ? product.images : product.image ? [{ src: product.image, alt: product.name }] : []
  return list.map((img) => ({
    originalSource: `${SITE_URL}${img.src}`,
    alt: img.alt ?? product.name,
    contentType: 'IMAGE',
  }))
}

function variantsFor(product) {
  return product.sizes.map((size) => {
    const weight = grams(size)
    return {
      optionValues: [{ optionName: 'Size', name: size }],
      price: money(priceFor(product, size)),
      compareAtPrice: money(mrpFor(product, size)),
      inventoryPolicy: 'DENY',
      taxable: true,
      inventoryItem: {
        sku: variantSku(product, size),
        tracked: true,
        requiresShipping: true,
        ...(weight ? { measurement: { weight: { unit: 'GRAMS', value: weight } } } : {}),
      },
    }
  })
}

let failures = 0

for (const product of PRODUCTS) {
  const category = CATEGORIES.find((c) => c.slug === product.category)
  const existing = (await shopify(FIND, { query: `handle:${product.slug}` })).products.nodes.find(
    (p) => p.handle === product.slug,
  )
  const variants = variantsFor(product)
  const images = imagesFor(product)
  const withContent = !existing || writeContent
  const withImages = !existing || existing.mediaCount.count === 0

  const notes = [
    withContent ? 'content' : null,
    withImages && images.length ? `${images.length} image(s)` : null,
  ].filter(Boolean)
  console.log(`${existing ? 'update' : 'create'}  ${product.name}${notes.length ? `  (+ ${notes.join(', ')})` : ''}`)
  for (const v of variants) {
    console.log(
      `        ${v.inventoryItem.sku.padEnd(18)} ${v.optionValues[0].name.padEnd(18)} ₹${v.price}  (MRP ₹${v.compareAtPrice})`,
    )
  }
  if (!apply) continue

  const input = {
    ...(existing ? { id: existing.id } : {}),
    title: product.name,
    handle: product.slug,
    vendor: 'Tatvyra',
    productType: category?.name ?? '',
    status: 'ACTIVE',
    productOptions: [{ name: 'Size', values: product.sizes.map((name) => ({ name })) }],
    variants,
    ...(withContent
      ? {
          descriptionHtml: descriptionFor(product, category),
          tags: [category?.name, product.format, product.priceTbc ? 'price-to-confirm' : null].filter(Boolean),
          seo: { title: `${product.name} | Tatvyra`, description: product.descriptor ?? '' },
        }
      : {}),
    ...(withImages && images.length ? { files: images } : {}),
  }

  try {
    const data = await shopify(SET, { input })
    assertNoUserErrors(data.productSet.userErrors, product.name)
  } catch (error) {
    failures += 1
    console.error(`        FAILED: ${error.message}`)
  }
}

console.log(
  apply
    ? `\nDone. ${PRODUCTS.length - failures} synced, ${failures} failed.`
    : '\nDry run only. Re-run with --apply to write these to Shopify.',
)
process.exitCode = failures ? 1 : 0
