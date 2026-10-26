import { useEffect, useMemo, useReducer, useState } from 'react'
import { getProduct } from '../data/catalogue'
import { deliveryFor, FREE_DELIVERY_FROM } from '../lib/shipping'
import { useLiveCatalogue } from '../lib/liveCatalogue'
import { CartContext } from './useCart'

/**
 * Frontend-only cart.
 *
 * A line stores only slug, size and quantity. Prices are looked up from the
 * catalogue on every render rather than copied into the stored line, so a price
 * change can never leave a stale number sitting in someone's saved cart.
 *
 * Totals are computed here, once, and read by every surface — the arithmetic
 * lives in one place so the drawer and any later checkout cannot drift apart.
 * These totals are for display while shopping. What is actually charged is
 * priced again on the server from Shopify (api/_lib/checkout.js), using the
 * same delivery rule from src/lib/shipping.js.
 */

const STORAGE_KEY = 'tatvyra.cart.v1'

const lineId = (slug, size) => `${slug}::${size ?? 'default'}`

function reducer(state, action) {
  switch (action.type) {
    case 'add': {
      const { slug, size, quantity = 1 } = action
      const id = lineId(slug, size)
      const existing = state.find((line) => line.id === id)
      if (existing) {
        return state.map((line) =>
          line.id === id ? { ...line, quantity: line.quantity + quantity } : line,
        )
      }
      return [...state, { id, slug, size: size ?? null, quantity }]
    }
    case 'setQuantity': {
      if (action.quantity <= 0) return state.filter((line) => line.id !== action.id)
      return state.map((line) =>
        line.id === action.id ? { ...line, quantity: action.quantity } : line,
      )
    }
    case 'remove':
      return state.filter((line) => line.id !== action.id)
    case 'clear':
      return []
    case 'hydrate':
      return action.lines
    default:
      return state
  }
}

function readStoredLines() {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    // Drop anything that no longer maps to a real product.
    return parsed.filter((line) => line && typeof line.slug === 'string' && getProduct(line.slug))
  } catch {
    return []
  }
}

export function CartProvider({ children }) {
  const [lines, dispatch] = useReducer(reducer, [], readStoredLines)
  const [isOpen, setIsOpen] = useState(false)
  /* Shopify's live prices when available, the catalogue's otherwise. */
  const { priceOf, snapshot: liveSnapshot } = useLiveCatalogue()

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(lines))
    } catch {
      /* storage can be unavailable (private mode) — the cart just won't persist */
    }
  }, [lines])

  const value = useMemo(() => {
    const items = lines
      .map((line) => {
        const product = getProduct(line.slug)
        if (!product) return null
        /* Fall back to nought rather than null, so one unpriced SKU cannot turn
           the whole basket into NaN. */
        const unitPrice = priceOf(product, line.size) ?? 0
        return { ...line, product, unitPrice, lineTotal: unitPrice * line.quantity }
      })
      .filter(Boolean)

    const subtotal = items.reduce((sum, line) => sum + line.lineTotal, 0)
    const delivery = deliveryFor(subtotal)

    return {
      items,
      count: items.reduce((total, line) => total + line.quantity, 0),
      subtotal,
      delivery,
      total: subtotal + delivery,
      freeDeliveryFrom: FREE_DELIVERY_FROM,
      isOpen,
      openCart: () => setIsOpen(true),
      closeCart: () => setIsOpen(false),
      addItem: (slug, size, quantity = 1) => {
        dispatch({ type: 'add', slug, size, quantity })
        setIsOpen(true)
      },
      setQuantity: (id, quantity) => dispatch({ type: 'setQuantity', id, quantity }),
      removeItem: (id) => dispatch({ type: 'remove', id }),
      clearCart: () => dispatch({ type: 'clear' }),
    }
    // priceOf is rebuilt every render; liveSnapshot is what actually changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lines, isOpen, liveSnapshot])

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>
}
