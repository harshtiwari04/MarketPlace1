import { CURRENCY } from './config';

const money = new Intl.NumberFormat('en-IN', { style: 'currency', currency: CURRENCY, maximumFractionDigits: 2 });
export const formatMoney = (n) => money.format(Number(n) || 0);
/** Razorpay amounts are in the smallest unit (paise). */
export const formatMinorUnits = (n) => money.format((Number(n) || 0) / 100);

export const formatDate = (d) => (d ? new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium' }).format(new Date(d)) : '—');

export function formatDuration(ms) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(s / 60);
  return m ? `${m}:${String(s % 60).padStart(2, '0')}` : `${s}s`;
}

export const initials = (name = '') => name.split(' ').filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join('') || '?';
export const titleCase = (s = '') => s.charAt(0).toUpperCase() + s.slice(1);
