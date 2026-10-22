/**
 * The payment seam.
 *
 * No page imports a provider directly. A provider is any object shaped like
 * the contract below; the checkout renders whatever methods the active
 * provider advertises and calls one function to take a payment.
 *
 * PROVIDERS
 *   razorpay  the live one (razorpayGateway.js) — talks to /api, which talks
 *             to Shopify and Razorpay. Secrets live only on the server.
 *   mock      a demo that moves no money (mockGateway.js), for working on the
 *             checkout without keys.
 * Chosen at build time with VITE_PAYMENT_PROVIDER (see .env.example).
 *
 * PROVIDER CONTRACT
 *   id       string   short identifier, e.g. 'mock'
 *   label    string   shown to the customer on the review line
 *   isDemo   boolean  true renders the demo notice in the payment UI
 *   methods  array    [{ id, label, hint, fields: [...] }] — empty when the
 *                     provider collects payment details in its own window
 *   pay(request) -> Promise<PaymentResult>
 *
 *     request  { amount, currency, method, fields, reference, lines, customer,
 *                onStage, onQuote }
 *       amount    rupees the customer was shown
 *       method    the chosen method id (null when `methods` is empty)
 *       fields    { [fieldName]: value } for that method
 *       reference the order reference, for reconciliation
 *       lines     [{ slug, size, quantity }] — the cart, for server pricing
 *       customer  the delivery details from the first checkout step
 *       onStage   optional (stage) => void, for progress copy
 *       onQuote   optional (totals) => void, the server's priced totals
 *
 *     PaymentResult { status, reference, method, message, code,
 *                     methodLabel?, order?, totals? }
 *       status  one of PaymentStatus.Succeeded | PaymentStatus.Failed
 *       code    machine-readable failure reason, null when succeeded
 *       message customer-facing sentence
 *       order   { name, statusPageUrl } of the Shopify order, when one exists
 */
import { mockGateway } from './mockGateway'
import { razorpayGateway } from './razorpayGateway'

/** The states the payment UI can be in. */
export const PaymentStatus = {
  Idle: 'idle',
  Processing: 'processing',
  Succeeded: 'succeeded',
  Failed: 'failed',
}

/** The active provider: VITE_PAYMENT_PROVIDER=razorpay goes live, anything else is the demo. */
export function getPaymentGateway() {
  return import.meta.env.VITE_PAYMENT_PROVIDER === 'razorpay' ? razorpayGateway : mockGateway
}
