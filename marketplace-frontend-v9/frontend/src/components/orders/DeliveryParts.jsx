import { useState } from 'react';
import { ExternalLink, Truck } from 'lucide-react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { FormField, Input, Select, Textarea } from '../ui/FormField';
import { Alert } from '../ui/Alert';
import { formatDate } from '../../lib/format';
import { CARRIERS, carrierLabel } from '../../lib/orderStatus';

const dateTime = (d) => (d ? new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(d)) : null);

/**
 * Read-only courier/tracking summary for one line item. Renders nothing when the seller hasn't
 * added anything and no automatic timestamp exists yet.
 */
export function DeliveryBlock({ delivery, compact = false }) {
  if (!delivery) return null;
  const carrier = carrierLabel(delivery);
  const rows = [
    carrier && ['Courier', carrier],
    delivery.trackingNumber && ['Tracking no.', delivery.trackingUrl
      ? <a href={delivery.trackingUrl} target="_blank" rel="noopener noreferrer" className="num">{delivery.trackingNumber} <ExternalLink size={12} style={{ verticalAlign: -1 }} /></a>
      : <span className="num">{delivery.trackingNumber}</span>],
    !delivery.trackingNumber && delivery.trackingUrl && ['Track', <a href={delivery.trackingUrl} target="_blank" rel="noopener noreferrer">Open tracking page <ExternalLink size={12} style={{ verticalAlign: -1 }} /></a>],
    delivery.shippedAt && ['Shipped', dateTime(delivery.shippedAt)],
    delivery.estimatedDeliveryAt && !delivery.deliveredAt && ['Estimated delivery', formatDate(delivery.estimatedDeliveryAt)],
    delivery.deliveredAt && ['Delivered', dateTime(delivery.deliveredAt)],
    delivery.notes && ['Note', delivery.notes],
  ].filter(Boolean);
  if (rows.length === 0) return null;
  return (
    <dl className={`order-kv ${compact ? 'text-sm' : ''}`} style={{ marginTop: 'var(--s-2)' }} aria-label="Delivery details">
      {rows.map(([k, v]) => <div key={k}><dt><Truck size={12} style={{ verticalAlign: -1, marginRight: 4 }} aria-hidden="true" />{k}</dt><dd>{v}</dd></div>)}
    </dl>
  );
}

const toDateInput = (d) => (d ? new Date(d).toISOString().slice(0, 10) : '');

/**
 * Seller/admin form for courier + tracking details. `onSave(patch)` receives only the fields the
 * user touched; empty strings are sent as-is and the backend treats '' as "clear this field".
 */
export function DeliveryForm({ open, onClose, item, onSave }) {
  const d = item?.delivery || {};
  const [form, setForm] = useState({
    carrier: d.carrier || '',
    carrierName: d.carrierName || '',
    trackingNumber: d.trackingNumber || '',
    trackingUrl: d.trackingUrl || '',
    estimatedDeliveryAt: toDateInput(d.estimatedDeliveryAt),
    notes: d.notes || '',
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [fieldErrors, setFieldErrors] = useState({});
  const set = (e) => { const { name, value } = e.target; setForm((f) => ({ ...f, [name]: value })); setFieldErrors((fe) => ({ ...fe, [name]: undefined })); };

  const submit = async (e) => {
    e.preventDefault(); setError(null); setBusy(true);
    try {
      const patch = { ...form };
      if (patch.carrier !== 'other') patch.carrierName = '';
      await onSave(patch);
      onClose();
    } catch (err) {
      setError(err.message);
      if (err.errors) setFieldErrors(err.errors);
    } finally { setBusy(false); }
  };

  return (
    <Modal open={open} onClose={onClose} title="Tracking details" description={item ? `${item.quantity}× ${item.title}` : undefined}
      footer={<><Button variant="secondary" onClick={onClose} disabled={busy}>Cancel</Button><Button onClick={submit} loading={busy}>Save</Button></>}>
      <form className="stack" onSubmit={submit} noValidate>
        {error && <Alert tone="danger">{error}</Alert>}
        <div className="form-grid">
          <FormField label="Courier" error={fieldErrors.carrier}>
            {(p) => (
              <Select {...p} name="carrier" value={form.carrier} onChange={set}>
                <option value="">Not set</option>
                {CARRIERS.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
              </Select>
            )}
          </FormField>
          {form.carrier === 'other' && (
            <FormField label="Courier name" error={fieldErrors.carrierName}>{(p) => <Input {...p} name="carrierName" value={form.carrierName} onChange={set} maxLength={60} />}</FormField>
          )}
          <FormField label="Tracking number" error={fieldErrors.trackingNumber}>{(p) => <Input {...p} name="trackingNumber" value={form.trackingNumber} onChange={set} className="num" maxLength={80} autoComplete="off" />}</FormField>
          <FormField label="Estimated delivery" error={fieldErrors.estimatedDeliveryAt}>{(p) => <Input {...p} type="date" name="estimatedDeliveryAt" value={form.estimatedDeliveryAt} onChange={set} min={toDateInput(new Date())} />}</FormField>
        </div>
        <FormField label="Tracking link" optional hint="https://… page where the buyer can follow the parcel" error={fieldErrors.trackingUrl}>
          {(p) => <Input {...p} type="url" name="trackingUrl" value={form.trackingUrl} onChange={set} placeholder="https://" inputMode="url" />}
        </FormField>
        <FormField label="Note for the buyer" optional error={fieldErrors.notes}>
          {(p) => <Textarea {...p} name="notes" value={form.notes} onChange={set} rows={2} maxLength={300} placeholder="e.g. Leave with security if not home" />}
        </FormField>
      </form>
    </Modal>
  );
}
