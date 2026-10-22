# Tatvyra — brand implementation notes

How the site maps onto the Tatvyra brand guidelines, and where the guidelines
forced a decision. Read this before changing colours, type or product copy.

---

## Source material

Everything factual on this site comes from `/Brand Assets`:

| File | What was taken from it |
| --- | --- |
| `Catalogue V7.pdf` | The Tatvyra logo (as vector), the four category descriptions, all 16 SKUs with their sizes and key benefits, the five on-pack mark definitions, the FSSAI mark, the brand line, and the range photography |
| `Tatvyra Busniess cards copy.pdf` | Company name, email addresses, phone numbers, registered address, `www.tatvyra.com` |

Nothing else was invented. See **What is deliberately missing** below.

---

## Logo

All of it was extracted as **vector paths** from the supplied
`final logo.pdf` — not redrawn, not traced, not set as live text. Proportions,
spacing, the leaf mark, the gold rule and the wordmark are exactly as supplied,
and so are the artwork's own colours (see the note below).

| File | What it is |
| --- | --- |
| `public/brand/tatvyra-logo.svg` | The lockup: wordmark, leaf mark, gold rule. For light grounds. |
| `public/brand/tatvyra-logo-reversed.svg` | The same lockup with the wordmark in white, for dark grounds. |
| `public/brand/tatvyra-mark.svg` | The leaf mark on its own. |
| `public/brand/ffc-logo.svg` | The Feynman Foodcraft `ffc` monogram. |
| `public/brand/ffc-logo-reversed.svg` | The monogram in white, for dark grounds. |
| `public/favicon.svg` | The leaf mark, centred in a square. |

**Colours are the artwork's own**, unlike the previous lockup, whose
CMYK-converted values were restored to the official brand hexes. This artwork
introduces colours the seven-hex palette does not name — the green leaf
(`#60974e`), the gold rule (`#be944c`) and the red dot (`#d4533c`) — so
normalising only its purple (`#5a2d88`, against the palette's `#5A218A`) would
leave the lockup half-converted. Ask Tatvyra before changing any of them.

**The favicon isolates the leaf mark.** The old guidelines said the mark must
not appear alone until the brand is established, and the old favicon used the
roundel instead. This lockup has no roundel, and a favicon cannot carry the
wordmark legibly at 16px, so the mark stands alone there. Worth confirming.

Rules enforced in `src/components/Logo.jsx`:

- Intrinsic aspect ratio is fixed and never distorted.
- Width is clamped to the 120px digital minimum for the full lockup.
- Clear space is applied as padding on `.logo` (roughly the leaf-mark height).
- No shadow, glow, outline, bevel, rotation, or placement over busy imagery.
- A dark ground takes the supplied white colourway (`reversed`), never a CSS
  recolour of the purple one and no longer a holding shape behind it.

`public/brand/tatvyra-logo-full.svg` and `tatvyra-logo-mark.png`/`.webp` are
the **superseded** lockup. Nothing references them; they are kept only until
Tatvyra confirms the new artwork replaces them everywhere.

---

## Colour

Only the seven brand colours appear anywhere in the CSS. You can verify this:

```bash
grep -rhoE "#[0-9a-fA-F]{3,8}" src/styles/ | sort -u
# → #2a2118 #30143f #5a218a #c9b8e8 #f26422 #f6b39b #f8f5ec
```

Every tint (`--surface-sunken`, `--text-muted`, `--line`, …) is a `color-mix()`
of two brand colours, so no eighth hue is ever introduced. Shadows use Ink with
alpha rather than black.

Balance follows the guidelines: Warm White is the page ground throughout, Ink
carries body copy, Purple carries headlines and the primary button, and Burnt
Orange stays an accent — the announcement rule, section rules, list bullets,
the active-nav underline, the cart badge, and one CTA button per view.

**No purple/orange gradient exists.** The only gradient on the site is the
single lilac wash behind the hero, which fades from Lilac to transparent Lilac.

### Where orange was pulled back, and why

Burnt Orange on Warm White measures about **2.9:1** — below the 4.5:1 needed for
body-size text. Rather than break either the palette or accessibility, orange is
used as *ground and graphic*, never as small text on Warm White:

- Eyebrows, numerals and category labels are Purple or Ink tints.
- The accent button is orange ground with **Deep Aubergine** text (5.0:1).
- The cart badge is orange ground with Deep Aubergine digits.
- Rules, bullets and underlines stay orange — they carry no text.

On dark grounds Soft Peach does the accent work, which clears AA comfortably.

---

## Typography

| Role | Face |
| --- | --- |
| Hero headline, section headings, large editorial statements | **Lumaire** (`--font-display`) |
| Navigation, body, buttons, forms, labels, product info | **Helvetica** (`--font-body`) |
| Anything | **Never Poppins** — the guidelines reserve it for the catalogue |

### Lumaire is not installed

The licensed Lumaire files are not in `/Brand Assets`, so they are not in this
repository, and no look-alike was substituted. Until they are supplied,
headlines render in Helvetica — the brand's own second face — so the site stays
compliant rather than approximating the display face with something random.

**To switch headlines to Lumaire:**

1. Put `Lumaire.woff2` (and optionally `Lumaire.woff`) in `public/fonts/`.
2. Uncomment the `@font-face` block in `src/styles/fonts.css`.

Nothing else changes — `--font-display` already lists `'Lumaire'` first.

---

## Photography

The catalogue contains range photography but **no per-SKU packshots**, and the
files are small (the widest is 660px). Consequences:

- Product cards and galleries fall back to the authentic photograph for that
  range. Each SKU has a `focus` (object-position) and `zoom` value in
  `src/data/catalogue.js` so sibling products read as different frames of the
  same shoot rather than the identical image repeated.
- Media frames are 4:3 (1:1 on phones) because a taller crop would upscale the
  source past the point where it holds up.
- Product detail pages say so in the gallery caption rather than implying the
  image is the pack.

**When real packshots arrive:** add an `image` (card) and/or `images` array
(gallery) to the SKU in `src/data/catalogue.js`. Both the card and the gallery
already prefer them and the caption disappears automatically. No packaging was
recreated, retouched or relabelled anywhere on the site.

---

## What is deliberately missing

The supplied material contains no prices, ingredient declarations, nutrition
panels, dosage guidance, certifications beyond FSSAI, reviews, ratings or
policies. None were invented. Instead:

| Missing | How the site handles it |
| --- | --- |
| Prices | **Placeholder.** The catalogue publishes none, so `src/data/catalogue.js` carries indicative rupee prices — per size where a SKU has several — purely so the cart can total an order. No payment backend is connected. Replace with the client's real pricing before launch. |
| Checkout | Live through Shopify + Razorpay + Shiprocket once configured (see `docs/COMMERCE-SETUP.md`); until `VITE_PAYMENT_PROVIDER=razorpay` is set it runs the clearly-labelled demo gateway. Shopify's prices are what get charged. |
| Ingredients / nutrition | The PDP states plainly that they are not yet published and points to the on-pack label and a real email address. |
| Reviews, ratings, awards | Absent. No placeholder stars, no "as seen in". |
| FAQ, shipping, returns, privacy, terms | Real routes that say the page is being prepared and give a working contact. Better an honest blank than invented terms. |
| Newsletter / contact submission | Forms validate and are wired, but say no endpoint is connected and hand the visitor an email address. |
| Social links | Omitted — no URLs were supplied. |

### Claims

Product benefits are transcribed **verbatim** from the catalogue. The five
on-pack marks carry the catalogue's own definitions word for word, including
the scope limits — e.g. the Vegan mark explicitly excludes raw honey, and it is
not applied to any honey SKU. Marks are assigned per SKU by hand in
`src/data/catalogue.js`, never applied blanket-fashion. "FSSAI-certified process
behind every batch" is used with the same wording as the catalogue, and the
FSSAI mark is the brand's own supplied asset.

No medical promise, superlative or unsupported claim appears in the copy.
