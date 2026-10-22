import { useMemo } from 'react'
import { Link, useParams } from 'react-router-dom'
import Button from '../components/Button'
import CheckoutSteps from '../components/CheckoutSteps'
import OrderSummary from '../components/OrderSummary'
import { getOrder } from '../lib/orders'
import { BRAND } from '../data/brand'
import usePageMeta from '../lib/usePageMeta'

export default function OrderConfirmation() {
  const { reference } = useParams()
  const order = useMemo(() => getOrder(reference), [reference])

  usePageMeta({
    title: order ? `Order ${order.reference} — Tatvyra` : 'Order — Tatvyra',
    description: 'Your Tatvyra order confirmation.',
  })

  if (!order) {
    return (
      <div className="checkout">
        <header className="page-head">
          <div className="shell">
            <p className="eyebrow">Order</p>
            <h1 className="display display--l">We cannot find that order.</h1>
            <p className="lede page-head__lede">
              Orders are kept in this browser only, so the reference will not open on another
              device. If you have just paid and landed here, email{' '}
              <a href={`mailto:${BRAND.contact.emails[0]}`}>{BRAND.contact.emails[0]}</a> with your
              reference and the team will pick it up.
            </p>
            <p className="checkout__empty-action">
              <Button to="/shop" variant="primary">Back to the shop</Button>
            </p>
          </div>
        </header>
      </div>
    )
  }

  const placed = new Date(order.placedAt)

  return (
    <div className="checkout">
      <header className="page-head checkout__head">
        <div className="shell">
          <p className="eyebrow">Order confirmed</p>
          <h1 className="display display--l">Thank you.</h1>
          <CheckoutSteps current="confirmation" />
        </div>
      </header>

      <div className="shell checkout__body">
        <div className="checkout__form confirm">
          <p className="confirm__lead">
            Your payment went through and the order is with the team.
          </p>

          <dl className="confirm__facts">
            {order.shopifyOrder?.name && (
              <div>
                <dt>Order number</dt>
                <dd className="confirm__reference">{order.shopifyOrder.name}</dd>
              </div>
            )}
            <div>
              <dt>Order reference</dt>
              <dd className="confirm__reference">{order.reference}</dd>
            </div>
            <div>
              <dt>Placed</dt>
              <dd>
                {placed.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}
              </dd>
            </div>
            <div>
              <dt>Paid by</dt>
              <dd>{order.paymentMethod}</dd>
            </div>
          </dl>

          <section className="confirm__block">
            <h2 className="checkout__subtitle">Delivering to</h2>
            <p className="checkout__recap-body">
              {order.delivery_to.name}
              <br />
              {order.delivery_to.address}
              {order.delivery_to.address2 ? <><br />{order.delivery_to.address2}</> : null}
              <br />
              {order.delivery_to.city}, {order.delivery_to.state} {order.delivery_to.pin}
              <br />
              {order.delivery_to.phone} · {order.delivery_to.email}
            </p>
          </section>

          <section className="confirm__block">
            <h2 className="checkout__subtitle">What happens next</h2>
            {/* Orders saved before the live gateway have no isDemo flag; they
                were all demo orders. */}
            {order.isDemo !== false ? (
              <p className="confirm__note">
                This order was placed in demo mode: no live payment provider was used, so nothing
                has been charged and no dispatch is scheduled. Quote{' '}
                <strong>{order.reference}</strong> if you get in touch at{' '}
                <a href={`mailto:${BRAND.contact.emails[0]}`}>{BRAND.contact.emails[0]}</a>.
              </p>
            ) : (
              <p className="confirm__note">
                We are packing your order now. Once it is handed to the courier you can follow it
                from your order status page
                {order.shopifyOrder?.statusPageUrl ? (
                  <>
                    {' '}
                    — <a href={order.shopifyOrder.statusPageUrl}>view order status</a>
                  </>
                ) : null}
                . Questions? Write to{' '}
                <a href={`mailto:${BRAND.contact.emails[0]}`}>{BRAND.contact.emails[0]}</a> and quote{' '}
                <strong>{order.shopifyOrder?.name ?? order.reference}</strong>.
              </p>
            )}
          </section>

          <div className="checkout__actions">
            <Button to="/shop" variant="primary">Continue shopping</Button>
            <Link to="/" className="checkout__back">Back to home</Link>
          </div>
        </div>

        <div className="checkout__aside">
          <OrderSummary
            lines={order.lines}
            subtotal={order.subtotal}
            delivery={order.delivery}
            total={order.total}
            title="What you ordered"
          />
        </div>
      </div>
    </div>
  )
}
