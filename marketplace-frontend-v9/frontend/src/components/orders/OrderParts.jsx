import { Check, X, Clock } from 'lucide-react';
import { Badge } from '../ui/Badge';
import { formatMoney } from '../../lib/format';
import { ORDER_STEPS, PAYMENT_LABELS, PAYMENT_TONES, statusLabel, statusTone } from '../../lib/orderStatus';
import { DeliveryBlock } from './DeliveryParts';

const dateTime = (d) =>
  d ? new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(d)) : '';

export function OrderStatusBadge({ status }) {
  return <Badge tone={statusTone(status)}>{statusLabel(status)}</Badge>;
}

export function PaymentBadge({ status }) {
  return <Badge tone={PAYMENT_TONES[status] || 'info'}>{PAYMENT_LABELS[status] || status}</Badge>;
}

/**
 * Vertical progress timeline. Reuses the checkout `.steps` visual language but stacks vertically
 * so timestamps fit. If the item/order was cancelled, the steps after the last reached one are
 * replaced by a single cancelled entry.
 */
export function OrderTimeline({ status, history = [] }) {
  const reachedAt = Object.fromEntries(history.map((h) => [h.status, h.at]));
  const cancelled = status === 'cancelled';
  // Highest linear step that was actually reached (an item cancelled at 'packed' shows placed→packed as done).
  const reachedIdx = ORDER_STEPS.reduce((m, s, i) => (reachedAt[s] ? i : m), -1);
  const currentIdx = cancelled ? reachedIdx : ORDER_STEPS.indexOf(status);

  const rows = ORDER_STEPS.slice(0, cancelled ? reachedIdx + 1 : ORDER_STEPS.length).map((s, i) => ({
    key: s,
    label: statusLabel(s),
    at: reachedAt[s],
    state: cancelled || i < currentIdx ? 'done' : i === currentIdx ? 'active' : '',
  }));
  if (cancelled) rows.push({ key: 'cancelled', label: 'Cancelled', at: reachedAt.cancelled, state: 'cancelled' });

  return (
    <ol className="order-timeline" aria-label="Order progress">
      {rows.map((r, i) => (
        <li key={r.key} className={`order-timeline-row ${r.state}`} aria-current={r.state === 'active' ? 'step' : undefined}>
          <span className="order-timeline-dot" aria-hidden="true">
            {r.state === 'done' || (r.state === 'active' && r.key === 'delivered') ? <Check size={12} /> : r.state === 'cancelled' ? <X size={12} /> : r.state === 'active' ? <Clock size={12} /> : null}
          </span>
          {i < rows.length - 1 && <span className="order-timeline-line" aria-hidden="true" />}
          <div>
            <div className="fw-600 text-sm">{r.label}</div>
            {r.at && <div className="text-xs text-muted">{dateTime(r.at)}</div>}
          </div>
        </li>
      ))}
    </ol>
  );
}

/**
 * Line items with per-item status. `renderAction(item)` lets the seller page slot its buttons in
 * without this component knowing about transitions.
 */
export function OrderItemsList({ items, showStatus = true, showDelivery = true, renderAction, renderMeta }) {
  return (
    <ul className="order-items">
      {items.map((item) => (
        <li key={item.productId || item.title} className="order-item">
          <div className="grow" style={{ minWidth: 0 }}>
            <div className="fw-600 truncate">{item.title}</div>
            <div className="text-sm text-muted num">
              {item.quantity} {item.unit} × {formatMoney(item.price)}
            </div>
            {renderMeta && <div className="text-xs text-muted" style={{ marginTop: 2 }}>{renderMeta(item)}</div>}
            {showStatus && <div style={{ marginTop: 'var(--s-2)' }}><OrderStatusBadge status={item.status} /></div>}
            {showDelivery && <DeliveryBlock delivery={item.delivery} compact />}
          </div>
          <div className="order-item-side">
            <div className="num fw-600">{formatMoney(item.lineTotal)}</div>
            {renderAction && <div className="order-item-actions">{renderAction(item)}</div>}
          </div>
        </li>
      ))}
    </ul>
  );
}

export function AddressBlock({ address, phone, email }) {
  if (!address) return null;
  return (
    <address style={{ fontStyle: 'normal' }} className="text-sm">
      <div>{address.street}</div>
      <div>{address.city}, {address.state} {address.postalCode}</div>
      <div>{address.country}</div>
      {(phone || email) && <div className="text-muted" style={{ marginTop: 'var(--s-2)' }}>{[phone, email].filter(Boolean).join(' · ')}</div>}
    </address>
  );
}

export function PaymentBlock({ payment, totalAmount, subtotalLabel, subtotal }) {
  return (
    <dl className="order-kv">
      {subtotal != null && <div><dt>{subtotalLabel || 'Your items'}</dt><dd className="num fw-600">{formatMoney(subtotal)}</dd></div>}
      <div><dt>Order total</dt><dd className="num fw-600">{formatMoney(totalAmount)}</dd></div>
      <div><dt>Payment</dt><dd><PaymentBadge status={payment.status} /></dd></div>
      {payment.paymentId && <div><dt>Payment reference</dt><dd className="num text-sm">{payment.paymentId}</dd></div>}
      {payment.refundId && <div><dt>Refund reference</dt><dd className="num text-sm">{payment.refundId}</dd></div>}
      {payment.failureReason && <div><dt>Note</dt><dd className="text-sm">{payment.failureReason}</dd></div>}
    </dl>
  );
}
