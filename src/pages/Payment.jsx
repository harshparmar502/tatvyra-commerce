import { useMemo, useState } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import Button from '../components/Button'
import CheckoutSteps from '../components/CheckoutSteps'
import OrderSummary from '../components/OrderSummary'
import { useCart } from '../context/useCart'
import { getPaymentGateway, PaymentStatus } from '../payments/gateway'
import { clearDraft, getDraft } from '../lib/checkoutDraft'
import { toOrderLines } from '../lib/cartLines'
import { makeReference, saveOrder } from '../lib/orders'
import { formatINR } from '../lib/money'
import usePageMeta from '../lib/usePageMeta'

export default function Payment() {
  const navigate = useNavigate()
  const { items, subtotal, delivery, total, clearCart } = useCart()
  const gateway = useMemo(() => getPaymentGateway(), [])
  const draft = useMemo(() => getDraft(), [])

  const [methodId, setMethodId] = useState(gateway.methods[0]?.id ?? null)
  const [values, setValues] = useState({})
  const [errors, setErrors] = useState({})
  const [status, setStatus] = useState(PaymentStatus.Idle)
  const [stage, setStage] = useState('')
  const [failure, setFailure] = useState(null)
  /* Set the moment payment succeeds. Without it, emptying the cart re-renders
     this page, the empty-cart guard below fires, and the customer is bounced to
     /shop before the confirmation route is ever reached. */
  const [placed, setPlaced] = useState(false)

  /* One reference for the whole visit to this page, so a retry after a decline
     stays the same order rather than becoming a second one. */
  const [reference] = useState(makeReference)

  /* The server's priced totals, once a live provider has quoted them. Until
     then the page shows the cart's own figures. */
  const [quote, setQuote] = useState(null)

  usePageMeta({
    title: 'Payment — Tatvyra',
    description: 'Pay for your Tatvyra order.',
  })

  const method = gateway.methods.find((m) => m.id === methodId) ?? gateway.methods[0] ?? null
  /* A provider with no methods (Razorpay) collects details in its own window. */
  const hosted = method === null
  const busy = status === PaymentStatus.Processing
  const shown = quote ?? { lines: toOrderLines(items), subtotal, delivery, total }
  /* Money has moved but the order is not confirmed yet: never offer a retry. */
  const awaitingConfirmation = failure?.code === 'confirm_pending'

  if (items.length === 0 && !placed) return <Navigate to="/shop" replace />
  if (!draft) return <Navigate to="/checkout" replace />

  const chooseMethod = (id) => {
    setMethodId(id)
    setValues({})
    setErrors({})
    setFailure(null)
  }

  const set = (name) => (event) => {
    const { value } = event.target
    setValues((prev) => ({ ...prev, [name]: value }))
    setErrors((prev) => (prev[name] ? { ...prev, [name]: null } : prev))
  }

  const validate = () => {
    const found = {}
    for (const f of method?.fields ?? []) {
      const message = f.validate?.(values[f.name] ?? '')
      if (message) found[f.name] = message
    }
    setErrors(found)
    return Object.keys(found).length === 0
  }

  const pay = async () => {
    if (busy) return
    setFailure(null)
    if (!validate()) return

    setStatus(PaymentStatus.Processing)
    setStage('Starting')

    let result
    try {
      result = await gateway.pay({
        amount: shown.total,
        currency: 'INR',
        method: method?.id ?? null,
        fields: values,
        reference,
        lines: items.map(({ slug, size, quantity }) => ({ slug, size, quantity })),
        customer: draft,
        onStage: setStage,
        onQuote: setQuote,
      })
    } catch {
      /* A provider that throws is still a failed payment as far as the
         customer is concerned — never a blank screen. */
      result = {
        status: PaymentStatus.Failed,
        code: 'unavailable',
        message: 'We could not reach the payment service. Nothing has been charged.',
      }
    }

    if (result.status === PaymentStatus.Succeeded) {
      setPlaced(true)
      setStatus(PaymentStatus.Succeeded)
      const paid = result.totals ?? shown
      const order = saveOrder({
        reference,
        placedAt: new Date().toISOString(),
        lines: paid.lines,
        subtotal: paid.subtotal,
        delivery: paid.delivery,
        total: paid.total,
        /* The method label only — no card, UPI or bank detail is stored. */
        paymentMethod: result.methodLabel ?? method?.label ?? gateway.label,
        gateway: gateway.label,
        isDemo: gateway.isDemo,
        /* { name, statusPageUrl } of the Shopify order, when one was created. */
        shopifyOrder: result.order ?? null,
        delivery_to: draft,
      })
      clearDraft()
      clearCart()
      /* Hold the success state briefly so it is seen, rather than flashing
         past on the way to the confirmation page. */
      await new Promise((resolve) => setTimeout(resolve, 1100))
      navigate(`/order/${order.reference}`, { replace: true })
      return
    }

    setStatus(PaymentStatus.Failed)
    setFailure(result)
  }

  return (
    <div className="checkout">
      <header className="page-head checkout__head">
        <div className="shell">
          <p className="eyebrow">Checkout</p>
          <h1 className="display display--l">Payment.</h1>
          <CheckoutSteps current="payment" />
        </div>
      </header>

      <div className="shell checkout__body">
        <div className="checkout__form pay">
          {gateway.isDemo && (
            <p className="pay__demo">
              <strong>Demo mode.</strong> No payment provider is connected yet, so nothing is sent
              anywhere and no money moves. Any details are accepted — to see the failure path, use a
              card number ending <code>0000</code>, a UPI ID beginning <code>fail</code>, or the
              declining bank.
            </p>
          )}

          <h2 className="checkout__subtitle">Payment method</h2>

          {hosted ? (
            <p className="pay__hosted">
              Pay securely with Razorpay — UPI, cards, netbanking and wallets. A Razorpay window
              opens when you press Pay; your card and UPI details go straight to Razorpay and never
              touch this site.
            </p>
          ) : (
          <div className="pay__methods" role="radiogroup" aria-label="Payment method">
            {gateway.methods.map((m) => (
              <button
                key={m.id}
                type="button"
                role="radio"
                aria-checked={m.id === methodId}
                className={`pay__method ${m.id === methodId ? 'is-selected' : ''}`}
                onClick={() => chooseMethod(m.id)}
                disabled={busy}
              >
                <span className="pay__method-label">{m.label}</span>
                <span className="pay__method-hint">{m.hint}</span>
              </button>
            ))}
          </div>
          )}

          <form
            className="pay__fields"
            onSubmit={(event) => {
              event.preventDefault()
              pay()
            }}
            noValidate
          >
            {!hosted && (
            <fieldset disabled={busy}>
              <legend className="visually-hidden">{method.label} details</legend>
              <div className="pay__grid">
                {method.fields.map((f) => (
                  <div key={f.name} className={`field ${f.half ? 'field--half' : ''}`}>
                    <label htmlFor={`pay-${f.name}`}>{f.label}</label>
                    {f.type === 'select' ? (
                      <select
                        id={`pay-${f.name}`}
                        value={values[f.name] ?? ''}
                        onChange={set(f.name)}
                        aria-invalid={errors[f.name] ? 'true' : undefined}
                        aria-describedby={errors[f.name] ? `pay-${f.name}-error` : undefined}
                      >
                        {f.options.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <input
                        id={`pay-${f.name}`}
                        type="text"
                        inputMode={f.inputMode}
                        placeholder={f.placeholder}
                        autoComplete={f.autoComplete}
                        value={values[f.name] ?? ''}
                        onChange={set(f.name)}
                        aria-invalid={errors[f.name] ? 'true' : undefined}
                        aria-describedby={errors[f.name] ? `pay-${f.name}-error` : undefined}
                      />
                    )}
                    {errors[f.name] && (
                      <p className="field__error" id={`pay-${f.name}-error`}>
                        {errors[f.name]}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </fieldset>
            )}

            {/* Everything the customer is told about the attempt lives in this
                one live region, so a screen reader hears each state change. */}
            <div className="pay__state" role="status" aria-live="polite">
              {busy && (
                <p className="pay__processing">
                  <span className="pay__spinner" aria-hidden="true" />
                  <span>
                    {stage}
                    <span className="pay__processing-note">
                      Do not close this window or go back.
                    </span>
                  </span>
                </p>
              )}

              {status === PaymentStatus.Failed && failure && (
                <div className="pay__failure">
                  <p className="pay__failure-title">
                    {awaitingConfirmation
                      ? 'Payment received — confirming your order'
                      : failure.code === 'price_changed'
                        ? 'Prices updated'
                        : 'Payment not completed'}
                  </p>
                  <p className="pay__failure-body">{failure.message}</p>
                </div>
              )}

              {status === PaymentStatus.Succeeded && (
                <p className="pay__success">
                  <span className="pay__tick" aria-hidden="true">✓</span>
                  <span>Payment authorised — opening your order…</span>
                </p>
              )}
            </div>

            {status === PaymentStatus.Succeeded || awaitingConfirmation ? null : status === PaymentStatus.Failed ? (
              <div className="checkout__actions">
                <Button type="submit" variant="primary">
                  {failure?.code === 'price_changed' ? 'Pay' : 'Try again —'} {formatINR(shown.total)}
                </Button>
                <button
                  type="button"
                  className="checkout__back"
                  onClick={() => {
                    setStatus(PaymentStatus.Idle)
                    setFailure(null)
                  }}
                >
                  {hosted ? 'Cancel' : 'Use a different method'}
                </button>
              </div>
            ) : (
              <div className="checkout__actions">
                <Button type="submit" variant="primary" disabled={busy}>
                  {busy ? 'Processing…' : `Pay ${formatINR(shown.total)}`}
                </Button>
                <Link to="/checkout" className="checkout__back">
                  Back to details
                </Link>
              </div>
            )}
          </form>
        </div>

        <div className="checkout__aside">
          <OrderSummary
            lines={shown.lines}
            subtotal={shown.subtotal}
            delivery={shown.delivery}
            total={shown.total}
          />
          <section className="checkout__recap" aria-label="Delivery address">
            <h2 className="osum__title">Delivering to</h2>
            <p className="checkout__recap-body">
              {draft.name}
              <br />
              {draft.address}
              {draft.address2 ? <><br />{draft.address2}</> : null}
              <br />
              {draft.city}, {draft.state} {draft.pin}
              <br />
              {draft.phone}
            </p>
            {draft.etaDays ? (
              <p className="checkout__recap-body">
                Estimated delivery: {draft.etaDays} {draft.etaDays === 1 ? 'day' : 'days'} after dispatch.
              </p>
            ) : null}
            <Link to="/checkout" className="checkout__back">Edit</Link>
          </section>
        </div>
      </div>
    </div>
  )
}
