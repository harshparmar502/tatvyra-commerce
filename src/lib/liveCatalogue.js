import { useSyncExternalStore } from 'react'
import { mrpFor, priceFor } from '../data/catalogue'
import { variantSku } from './variantSku'

/**
 * Live prices and stock from Shopify, for display.
 *
 * The site renders straight away with the prices in src/data/catalogue.js,
 * then swaps in Shopify's figures as soon as /api/products/live answers (once
 * per visit). If Shopify cannot be reached, the catalogue prices simply stay
 * and everything remains buyable — the checkout re-checks price and stock
 * with Shopify before any payment, so nothing wrong can be charged.
 */

let state = { status: 'idle', variants: null }
const listeners = new Set()

function update(next) {
  state = next
  listeners.forEach((listener) => listener())
}

function load() {
  if (state.status !== 'idle' || typeof window === 'undefined') return
  update({ status: 'loading', variants: null })
  fetch('/api/products/live')
    .then((res) => (res.ok ? res.json() : Promise.reject(new Error(String(res.status)))))
    .then((data) => update({ status: 'ready', variants: data.variants ?? {} }))
    .catch(() => update({ status: 'unavailable', variants: null }))
}

function subscribe(listener) {
  listeners.add(listener)
  load()
  return () => listeners.delete(listener)
}

const getSnapshot = () => state

/**
 * priceOf / mrpOf / inStock for a product and size. Use these instead of the
 * catalogue's priceFor / mrpFor anywhere a price is shown or charged in the
 * cart. `snapshot` changes when live data arrives, for useMemo dependencies.
 */
export function useLiveCatalogue() {
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
  const ready = snapshot.status === 'ready'
  const live = (product, size) => (ready ? snapshot.variants[variantSku(product, size)] : undefined)

  return {
    snapshot,
    isLive: ready,
    priceOf: (product, size) => live(product, size)?.price ?? priceFor(product, size),
    mrpOf: (product, size) => {
      const v = live(product, size)
      return v ? (v.mrp ?? v.price) : mrpFor(product, size)
    },
    /* Until Shopify answers, or if it cannot, everything counts as in stock.
       Once it has answered, a size Shopify does not sell is not in stock. */
    inStock: (product, size) => (ready ? Boolean(live(product, size)?.available) : true),
  }
}

/** "10% off" from the two figures actually shown, or null when there is no saving. */
export function discountLabel(price, mrp) {
  if (!price || !mrp || mrp <= price) return null
  return `${Math.round((1 - price / mrp) * 100)}% off`
}
