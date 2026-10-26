import { useState } from 'react'
import { Link } from 'react-router-dom'
import { getCategory } from '../data/catalogue'
import { formatINR } from '../lib/money'
import { useLiveCatalogue } from '../lib/liveCatalogue'
import { useCart } from '../context/useCart'

/**
 * One card for every product surface on the site.
 *
 * Deliberately spare: no ratings, no review counts, no invented badges. The
 * only chip shown is the product's format, which is printed in the catalogue.
 * The price follows the selected size chip and comes from Shopify when it is
 * reachable (useLiveCatalogue), so the card, the product page and the cart
 * cannot disagree. It is shown as a pair: what the pack costs today, and the
 * MRP it is struck from.
 */
export default function ProductCard({ product, priority = false }) {
  const category = getCategory(product.category)
  const [size, setSize] = useState(product.sizes[0])
  const { addItem } = useCart()
  const { priceOf, mrpOf, inStock } = useLiveCatalogue()
  const hasSizeChoice = product.sizes.length > 1
  const priceValue = priceOf(product, size)
  const mrpValue = mrpOf(product, size)
  const price = formatINR(priceValue)
  const mrp = mrpValue > priceValue ? formatINR(mrpValue) : null
  const available = inStock(product, size)

  return (
    <article className="pcard">
      <Link to={`/product/${product.slug}`} className="pcard__media frame frame--4x5" tabIndex={-1} aria-hidden="true">
        <img
          src={product.image ?? category.image}
          alt=""
          loading={priority ? 'eager' : 'lazy'}
          decoding="async"
          style={{ objectPosition: product.focus, '--zoom': product.zoom }}
        />
        <span className="pcard__format">{product.format}</span>
      </Link>

      <div className="pcard__body">
        <p className="pcard__category">{category.name}</p>
        <h3 className="pcard__name">
          <Link to={`/product/${product.slug}`} className="pcard__link">
            {product.name}
          </Link>
        </h3>
        <p className="pcard__descriptor">{product.descriptor}</p>

        {hasSizeChoice ? (
          <div className="pcard__sizes" role="group" aria-label={`Size for ${product.name}`}>
            {product.sizes.map((option) => (
              <button
                key={option}
                type="button"
                className={`pcard__size ${size === option ? 'is-selected' : ''}`}
                aria-pressed={size === option}
                onClick={() => setSize(option)}
              >
                {option}
              </button>
            ))}
          </div>
        ) : (
          <p className="pcard__size-single">{product.sizes[0]}</p>
        )}

        <div className="pcard__foot">
          <p className="pcard__price">
            {price ? (
              <>
                <span className="pcard__price-value">{price}</span>
                {mrp && (
                  <span className="pcard__price-mrp">
                    <span className="visually-hidden">MRP </span>
                    <s>{mrp}</s>
                  </span>
                )}
              </>
            ) : (
              <span className="pcard__price-tbc">Price on request</span>
            )}
          </p>
          <div className="pcard__actions">
            <button
              type="button"
              className="pcard__add"
              onClick={() => addItem(product.slug, size)}
              disabled={!available}
            >
              {available ? 'Add to cart' : 'Out of stock'}
              <span className="visually-hidden"> — {product.name}, {size}</span>
            </button>
            <Link to={`/product/${product.slug}`} className="pcard__view">
              View product
              <span className="visually-hidden"> — {product.name}</span>
            </Link>
          </div>
        </div>
      </div>
    </article>
  )
}
