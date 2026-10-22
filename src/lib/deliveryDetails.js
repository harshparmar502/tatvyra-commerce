/**
 * Delivery details: the empty form and its validators.
 *
 * Shared by the checkout page and the server, so an address the page accepts
 * is exactly an address the server accepts.
 */

/** Field name -> validator. Returns a message, or null when the value is fine. */
export const DELIVERY_RULES = {
  name: (v) => (v.trim().length >= 2 ? null : 'Enter the name for the delivery.'),
  email: (v) => (/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.trim()) ? null : 'Enter a valid email address.'),
  phone: (v) => (v.replace(/\D/g, '').length === 10 ? null : 'Enter a 10-digit mobile number.'),
  address: (v) => (v.trim().length >= 6 ? null : 'Enter the street address.'),
  city: (v) => (v.trim().length >= 2 ? null : 'Enter the town or city.'),
  state: (v) => (v.trim().length >= 2 ? null : 'Enter the state.'),
  pin: (v) => (/^\d{6}$/.test(v.trim()) ? null : 'Enter a 6-digit PIN code.'),
}

export const EMPTY_DELIVERY = {
  name: '',
  email: '',
  phone: '',
  address: '',
  address2: '',
  city: '',
  state: '',
  pin: '',
}

/** { field: message } for every invalid field; empty when all are fine. */
export function validateDelivery(values = {}) {
  const found = {}
  for (const [field, rule] of Object.entries(DELIVERY_RULES)) {
    const value = values[field]
    const message = rule(typeof value === 'string' ? value : '')
    if (message) found[field] = message
  }
  return found
}
