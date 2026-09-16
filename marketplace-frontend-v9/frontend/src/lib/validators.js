export const isEmail = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v).trim());
// WhatsApp numbers need a country code: + and 10–15 digits.
export const isPhone = (v) => /^\+[1-9]\d{9,14}$/.test(String(v).replace(/[\s()-]/g, ''));
export const normalizePhone = (v) => String(v).replace(/[\s()-]/g, '');

export function required(value, label = 'This field') {
  return String(value ?? '').trim() ? null : `${label} is required`;
}
export function minLength(value, n, label = 'This field') {
  return String(value ?? '').trim().length >= n ? null : `${label} must be at least ${n} characters`;
}
export function maxLength(value, n, label = 'This field') {
  return String(value ?? '').length <= n ? null : `${label} must be ${n} characters or fewer`;
}

/** Runs `{ field: [fn, fn] }` rules against values. Returns `{ field: message }` for failures only. */
export function validate(values, rules) {
  const errors = {};
  for (const [field, fns] of Object.entries(rules)) {
    for (const fn of fns) {
      const msg = fn(values[field], values);
      if (msg) { errors[field] = msg; break; }
    }
  }
  return errors;
}

export const rules = {
  register: {
    name: [(v) => required(v, 'Name'), (v) => minLength(v, 2, 'Name')],
    email: [(v) => required(v, 'Email'), (v) => (isEmail(v) ? null : 'Enter a valid email address')],
    password: [(v) => required(v, 'Password'), (v) => minLength(v, 8, 'Password')],
  },
  login: {
    email: [(v) => required(v, 'Email'), (v) => (isEmail(v) ? null : 'Enter a valid email address')],
    password: [(v) => required(v, 'Password')],
  },
  forgotPassword: {
    email: [(v) => required(v, 'Email'), (v) => (isEmail(v) ? null : 'Enter a valid email address')],
  },
  resetPassword: {
    password: [(v) => required(v, 'Password'), (v) => minLength(v, 8, 'Password')],
  },
  sellerSetup: {
    storeName: [(v) => required(v, 'Store name'), (v) => minLength(v, 2, 'Store name'), (v) => maxLength(v, 60, 'Store name')],
    description: [(v) => maxLength(v, 300, 'Description')],
  },
  product: {
    title: [(v) => required(v, 'Title'), (v) => minLength(v, 3, 'Title'), (v) => maxLength(v, 120, 'Title')],
    description: [(v) => required(v, 'Description'), (v) => maxLength(v, 2000, 'Description')],
    price: [(v) => required(v, 'Price'), (v) => (Number(v) > 0 ? null : 'Price must be greater than 0')],
    stock: [(v) => required(v, 'Stock'), (v) => (Number.isInteger(Number(v)) && Number(v) >= 0 ? null : 'Stock must be a whole number, 0 or more')],
    unit: [(v) => required(v, 'Unit')],
    category: [(v) => required(v, 'Category')],
  },
  contact: {
    name: [(v) => required(v, 'Full name'), (v) => minLength(v, 2, 'Full name')],
    email: [(v) => (!v || isEmail(v) ? null : 'Enter a valid email address')],
    phone: [(v) => required(v, 'WhatsApp number'), (v) => (isPhone(v) ? null : 'Use international format, e.g. +91 98765 43210')],
  },
  address: {
    line1: [(v) => required(v, 'Address')],
    city: [(v) => required(v, 'City')],
    state: [(v) => required(v, 'State')],
    postalCode: [(v) => required(v, 'Postal code'), (v) => (/^[A-Za-z0-9 -]{4,10}$/.test(v) ? null : 'Enter a valid postal code')],
  },
};
