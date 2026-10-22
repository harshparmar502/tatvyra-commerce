# Commerce setup — Shopify, Razorpay, Shiprocket

How the live checkout works, and the one-time steps in each dashboard to turn it on.

## How the pieces fit

```
Browser (this site)                 /api (Vercel functions)              Services
─────────────────────               ───────────────────────              ────────
/checkout  details form  ── GET  /api/shipping/check?pin= ──────────▶  Shiprocket: is the PIN deliverable?
/checkout/payment  Pay   ── POST /api/checkout/create ──────────────▶  Shopify: price cart, create draft order
                                                                  ──▶  Razorpay: create order for that total
           Razorpay window (UPI / card / netbanking / wallet)  ◀────▶  Razorpay
           on success    ── POST /api/checkout/verify ──────────────▶  Razorpay: check payment
                                                                  ──▶  Shopify: complete draft → PAID order
Razorpay ── POST /api/razorpay/webhook ─────────── same as verify (backup if the tab was closed)
Shopify paid order ──────────────────── Shiprocket Shopify channel ──▶ pick courier, AWB, tracking
```

- **Shopify** is the source of truth for prices, stock and orders. The site keeps
  its own product pages (`src/data/catalogue.js`); the two are joined by SKU
  (`src/lib/variantSku.js`).
- **Prices are never trusted from the browser.** The server prices the cart in
  Shopify and charges exactly the Shopify draft order total.
- **Secrets stay on the server.** Only `VITE_PAYMENT_PROVIDER` reaches the browser;
  the Razorpay key id is handed out by `/api/checkout/create`.
- **Shiprocket gets orders from Shopify**, not from this code, so nothing is
  shipped twice.

## 1. Shopify

1. Settings → General: store currency **INR**.
2. Settings → Taxes and duties: turn on **"Include tax in prices"** (Indian MRPs
   include GST). If this is off, Shopify adds GST on top and every checkout will
   stop with "Prices updated".
3. Create an app with Admin API access — either a custom app in the admin
   (gives a `shpat_…` token → `SHOPIFY_ADMIN_TOKEN`) or a Dev Dashboard app
   installed on your store (→ `SHOPIFY_CLIENT_ID` / `SHOPIFY_CLIENT_SECRET`).
   Scopes: `write_draft_orders`, `read_orders`, `write_orders`, `read_products`,
   `write_products`, `read_inventory`.
4. Put the values in `.env.local` (copy `.env.example`), then create the products:
   ```bash
   npm run shopify:sync              # dry run — check the list of SKUs and prices
   npm run shopify:sync -- --apply   # write them to Shopify
   ```
5. In Shopify, set **stock** for each variant, and a **weight** for any variant
   whose size isn't in grams (tablets, capsules, gummies). Shiprocket uses the
   weight for courier rates.
6. Settings → Notifications: check the order confirmation email — place a test
   order and confirm the customer receives it.

## 2. Razorpay

1. Start with **test mode** keys (`rzp_test_…`) → `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`.
2. Account & Settings → Payment capture: **automatic** is recommended. (If it's
   manual, the server captures the payment itself.)
3. Settings → Webhooks → Add:
   - URL: `https://<your-domain>/api/razorpay/webhook`
   - Events: `payment.captured`, `order.paid`
   - Secret: any long random string → `RAZORPAY_WEBHOOK_SECRET`
4. When going live: complete Razorpay KYC and website verification, swap to
   `rzp_live_…` keys, and add a live-mode webhook the same way.

## 3. Shiprocket

1. Channels → Add channel → **Shopify**, connect your store. Paid Shopify orders
   now appear in Shiprocket automatically, and tracking is written back to Shopify.
2. Settings → Pickup addresses: add your warehouse. Its PIN → `SHIPROCKET_PICKUP_PIN`.
3. Settings → API → create an API user → `SHIPROCKET_EMAIL`, `SHIPROCKET_PASSWORD`.
   (Use a dedicated API user, not your main login.)

If the Shiprocket settings are missing or Shiprocket is down, checkout still
works — it just skips the PIN check.

## 4. Vercel

1. Project → Settings → Environment Variables: add every name from `.env.example`
   with real values, and set `VITE_PAYMENT_PROVIDER=razorpay`.
2. Redeploy (`VITE_` values are baked in at build time).

## 5. Test before going live

With test keys and `VITE_PAYMENT_PROVIDER=razorpay` in `.env.local`, run
`npm run dev` (the `/api` functions run inside the dev server) and check:

- [ ] An undeliverable PIN (e.g. `000000`) is refused on the details page.
- [ ] A successful test payment lands on the confirmation page with a Shopify order number.
- [ ] The order shows in Shopify as **Paid**, tagged `razorpay:pay_…`, with the right
      lines, address, delivery charge and total.
- [ ] The order appears in Shiprocket.
- [ ] Closing the Razorpay window shows "Nothing has been charged" and Pay works again.
- [ ] A failed test payment shows the failure message.
- [ ] Out-of-stock: set a variant to 0 stock → checkout says it is out of stock.
- [ ] Webhook: pay, then close the tab before the confirmation page loads → the
      order still appears in Shopify within a minute. (The local dev server is not
      reachable by Razorpay; test this on a Vercel preview deployment.)

## Known limits

- **No cash on delivery.** Razorpay is prepaid only. COD would need a separate
  "place order without payment" path.
- **No discount codes** yet. Shopify draft orders support them; the checkout
  would need a code field passed through to `/api/checkout/create`.
- **Unpaid draft orders** pile up in Shopify → Orders → Drafts when customers
  abandon at the payment step. They are harmless; delete them occasionally.
- **No rate limiting** on `/api/checkout/create`. If it gets abused, add Vercel
  Firewall rules or a captcha.
- **Delivery charge** is still the placeholder rule in `src/lib/shipping.js`
  (free from ₹999, else ₹79). Change it there; the server uses the same file.
