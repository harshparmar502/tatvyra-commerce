import { useState } from 'react'
import { Link } from 'react-router-dom'
import Button from './Button'
import QuantitySelector from './QuantitySelector'
import { MARKS } from '../data/brand'
import { benefitsFor } from '../data/catalogue'
import { formatINR } from '../lib/money'
import { discountLabel, useLiveCatalogue } from '../lib/liveCatalogue'
import { useCart } from '../context/useCart'

/**
 * Renders only the fields that actually exist for a product. Ingredients,
 * nutrition tables, dosage and certifications are not published in the supplied
 * catalogue, so those blocks state that plainly instead of being filled in.
 */
export default function ProductInfo({ product, category }) {
  const [size, setSize] = useState(product.sizes[0])
  const [quantity, setQuantity] = useState(1)
  const { priceOf, mrpOf, inStock } = useLiveCatalogue()
  const priceValue = priceOf(product, size)
  const mrpValue = mrpOf(product, size)
  const price = formatINR(priceValue)
  const off = discountLabel(priceValue, mrpValue)
  const mrp = off ? formatINR(mrpValue) : null
  const available = inStock(product, size)
  const benefits = benefitsFor(product)
  const { addItem } = useCart()

  return (
    <div className="pinfo">
      <p className="pinfo__category">
        <Link to={`/shop/${category.slug}`}>{category.name}</Link>
        <span className="pinfo__sku">{product.sku}</span>
      </p>

      <h1 className="display display--m pinfo__name">{product.name}</h1>
      {/* A full product description, where one is supplied, takes the short
          descriptor's place; cards keep the short line. */}
      {product.description ? (
        <p className="pinfo__descriptor pinfo__descriptor--long">{product.description}</p>
      ) : (
        <p className="pinfo__descriptor">{product.description ?? product.descriptor}</p>
      )}

      <div className="pinfo__price">
        {price ? (
          <>
            <p className="pinfo__price-now">
              <span className="pinfo__price-value">{price}</span>
              {mrp && (
                <span className="pinfo__price-mrp">
                  <span className="visually-hidden">MRP </span>
                  <s>{mrp}</s>
                </span>
              )}
              {off && <span className="pinfo__price-off">{off}</span>}
            </p>
            {/* A pack the supplied price sheet does not carry: the figure is
                ours, so the page says so rather than letting it read as MRP. */}
            {product.priceTbc && (
              <span className="pinfo__price-note">
                Indicative price — Tatvyra&rsquo;s MRP for this pack is still to be confirmed.
              </span>
            )}
          </>
        ) : (
          <>
            <span className="pinfo__price-tbc">Price on request</span>
            <span className="pinfo__price-note">
              Retail pricing for this SKU is not published yet.
            </span>
          </>
        )}
      </div>

      <div className="pinfo__buy">
        <fieldset className="pinfo__sizes">
          <legend className="pinfo__legend">
            {product.sizes.length > 1 ? 'Size' : 'Pack size'}
          </legend>
          {product.sizes.length > 1 ? (
            <div className="pinfo__size-set">
              {product.sizes.map((option) => (
                <button
                  key={option}
                  type="button"
                  className={`chip chip--lg ${size === option ? 'is-selected' : ''}`}
                  aria-pressed={size === option}
                  onClick={() => setSize(option)}
                >
                  {option}
                </button>
              ))}
            </div>
          ) : (
            <p className="pinfo__size-single">{product.sizes[0]}</p>
          )}
        </fieldset>

        <div className="pinfo__actions">
          <QuantitySelector value={quantity} onChange={setQuantity} label={`Quantity of ${product.name}`} />
          <Button
            variant="primary"
            full
            onClick={() => addItem(product.slug, size, quantity)}
            disabled={!available}
          >
            {available ? 'Add to cart' : 'Out of stock'}
          </Button>
        </div>
      </div>

      <div className="pinfo__blocks">
        <section className="pinfo__block">
          <h2 className="pinfo__block-title">Key benefits</h2>
          <ul className="pinfo__benefits">
            {benefits.items.map((benefit) => (
              <li key={benefit}>{benefit}</li>
            ))}
          </ul>
          {benefits.fromCatalogue && (
            <p className="pinfo__source">As stated in the Tatvyra product catalogue.</p>
          )}
        </section>

        {/* What this SKU's label says and does not say, where that copy was
            supplied — the same pair layout as the on-pack marks below. */}
        {product.claims && (
          <section className="pinfo__block">
            <h2 className="pinfo__block-title">Clean label</h2>
            <dl className="pinfo__marks">
              {product.claims.map((claim) => (
                <div key={claim.label}>
                  <dt>{claim.label}</dt>
                  <dd>{claim.body}</dd>
                </div>
              ))}
            </dl>
          </section>
        )}

        {/* The range's own lines about its ingredient, where the range has
            them — the same block and list as the benefits above. */}
        {category.highlights && (
          <section className="pinfo__block">
            <h2 className="pinfo__block-title">{category.highlights.title}</h2>
            <ul className="pinfo__benefits">
              {category.highlights.points.map((point) => (
                <li key={point}>{point}</li>
              ))}
            </ul>
          </section>
        )}

        <section className="pinfo__block">
          <h2 className="pinfo__block-title">On-pack marks</h2>
          <dl className="pinfo__marks">
            {product.marks.map((key) => (
              <div key={key}>
                <dt>{MARKS[key].label}</dt>
                <dd>{MARKS[key].definition}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section className="pinfo__block">
          <h2 className="pinfo__block-title">Ingredients & nutrition</h2>
          <p className="pinfo__pending">
            The full ingredient declaration and nutrition panel for this SKU are not published in
            the current catalogue. They will be listed here as soon as they are confirmed — until
            then, the on-pack label is the authority. Ask us at{' '}
            <a href="mailto:connect@feynmanfoodcraft.com">connect@feynmanfoodcraft.com</a>.
          </p>
        </section>
      </div>
    </div>
  )
}
