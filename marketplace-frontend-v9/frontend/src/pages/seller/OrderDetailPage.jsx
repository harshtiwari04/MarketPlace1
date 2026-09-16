import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Info, Truck } from 'lucide-react';
import { sellerOrders } from '../../lib/endpoints';
import { useAsync } from '../../hooks/useAsync';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { useToast } from '../../context/ToastContext';
import { formatDate } from '../../lib/format';
import { ACTION_LABELS, TRANSITIONS, canEditDelivery, statusLabel } from '../../lib/orderStatus';
import { DeliveryForm } from '../../components/orders/DeliveryParts';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { Alert } from '../../components/ui/Alert';
import { ConfirmDialog } from '../../components/ui/Modal';
import { Skeleton } from '../../components/ui/Skeleton';
import { ErrorState } from '../../components/ui/States';
import { AddressBlock, OrderItemsList, OrderStatusBadge, OrderTimeline, PaymentBlock, PaymentBadge } from '../../components/orders/OrderParts';

export default function OrderDetailPage() {
  const { id } = useParams();
  const { data: order, loading, error, reload } = useAsync((s) => sellerOrders.detail(id, { signal: s }), [id]);
  useDocumentTitle(order ? `Order ${order.orderId}` : 'Order');
  const toast = useToast();
  const [busy, setBusy] = useState(null); // productId currently being updated
  const [confirmCancel, setConfirmCancel] = useState(null); // item awaiting cancel confirmation
  const [local, setLocal] = useState(null); // optimistic copy after a successful PATCH
  const [trackingFor, setTrackingFor] = useState(null); // item whose tracking details are being edited
  const view = local || order;

  const move = async (item, status) => {
    setBusy(item.productId);
    try {
      const updated = await sellerOrders.updateItemStatus(view.orderId, item.productId, status);
      setLocal(updated);
      toast.success(`${item.title}: ${statusLabel(status)}`);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(null);
      setConfirmCancel(null);
    }
  };

  const saveDelivery = async (item, patch) => {
    const updated = await sellerOrders.updateItemDelivery(view.orderId, item.productId, patch);
    setLocal(updated);
    toast.success('Tracking details saved');
  };

  const renderAction = (item) => {
    const next = TRANSITIONS[item.status] || [];
    const trackingBtn = canEditDelivery(item) && view.payment.status === 'paid' ? (
      <Button key="tracking" size="sm" variant="secondary" icon={Truck} onClick={() => setTrackingFor(item)} disabled={!!busy}>
        {item.delivery?.trackingNumber || item.delivery?.trackingUrl ? 'Edit tracking' : 'Add tracking'}
      </Button>
    ) : null;
    if (next.length === 0) return trackingBtn;
    const unpaid = view.payment.status !== 'paid';
    return [trackingBtn, ...next.map((status) => {
      const isCancel = status === 'cancelled';
      // Backend rule: unpaid orders may only be cancelled, never progressed.
      const disabled = unpaid && !isCancel;
      return (
        <Button
          key={status}
          size="sm"
          variant={isCancel ? 'ghost' : 'primary'}
          loading={busy === item.productId}
          disabled={disabled || (busy && busy !== item.productId)}
          title={disabled ? 'Waiting for payment' : undefined}
          onClick={() => (isCancel ? setConfirmCancel(item) : move(item, status))}
        >
          {ACTION_LABELS[status]}
        </Button>
      );
    })];
  };

  if (error) return <ErrorState error={error} onRetry={reload} />;
  if (loading || !view) {
    return <div className="stack"><Skeleton w="40%" h={28} /><Skeleton h={180} r={10} /><Skeleton h={120} r={10} /></div>;
  }

  const mine = view.items;
  const allTerminal = mine.every((i) => i.status === 'delivered' || i.status === 'cancelled');

  return (
    <>
      <nav className="breadcrumb" aria-label="Breadcrumb"><Link to="/seller/orders"><ArrowLeft size={14} /> Orders</Link></nav>
      <div className="page-head">
        <div>
          <h1 className="page-title num">{view.orderId}</h1>
          <p className="text-muted">Placed {formatDate(view.createdAt)} · <PaymentBadge status={view.payment.status} /></p>
        </div>
        {view.overallStatus !== mine[0]?.status && (
          <div className="text-sm text-muted row" title="Aggregate across every seller on this order">
            <Info size={14} aria-hidden="true" /> Whole order: <OrderStatusBadge status={view.overallStatus} />
          </div>
        )}
      </div>

      {view.payment.status === 'pending' && (
        <Alert tone="warning" title="Payment not yet received">
          The buyer has not completed payment. You can cancel your items, but they can’t be confirmed or shipped until payment is captured.
        </Alert>
      )}
      {view.payment.status === 'failed' && (
        <Alert tone="danger" title="Payment failed">Do not ship. {view.payment.failureReason && `Reason: ${view.payment.failureReason}.`}</Alert>
      )}
      {view.payment.refundId && (
        <Alert tone="info" title="Refunded">This order was refunded to the buyer (reference {view.payment.refundId}). No fulfilment needed.</Alert>
      )}

      <div className="order-grid" style={{ marginTop: 'var(--s-4)' }}>
        <div className="stack">
          <Card title={`Your items (${mine.length})`}>
            <OrderItemsList items={mine} renderAction={allTerminal ? undefined : renderAction} />
            {mine.some((i) => canEditDelivery(i)) && view.payment.status === 'paid' && !mine.some((i) => i.delivery?.trackingNumber) && (
              <p className="text-xs text-muted" style={{ marginTop: 'var(--s-3)' }}>Add the courier and tracking number so the buyer can follow the parcel — it shows on their order page instantly.</p>
            )}
          </Card>
          {mine.length === 1 && (
            <Card title="Progress"><OrderTimeline status={mine[0].status} history={mine[0].statusHistory} /></Card>
          )}
        </div>
        <div className="stack">
          <Card title="Ship to"><AddressBlock address={view.shippingAddress} phone={view.buyer.phone} email={view.buyer.email} /></Card>
          <Card title="Payment">
            <PaymentBlock payment={view.payment} totalAmount={view.totalAmount} subtotal={view.yourSubtotal} subtotalLabel="Your items" />
            <p className="text-xs text-muted" style={{ marginTop: 'var(--s-3)' }}>
              Order total includes other sellers’ items, which are not shown to you.
            </p>
          </Card>
        </div>
      </div>

      <ConfirmDialog
        open={!!confirmCancel}
        onCancel={() => setConfirmCancel(null)}
        onConfirm={() => move(confirmCancel, 'cancelled')}
        title="Cancel this item?"
        confirmLabel="Cancel item"
        danger
        loading={!!busy}
      >
        {confirmCancel && <>“{confirmCancel.title}” will be marked cancelled and the buyer will be notified on WhatsApp. This can’t be undone from here.</>}
      </ConfirmDialog>
      {trackingFor && (
        <DeliveryForm open item={trackingFor} onClose={() => setTrackingFor(null)} onSave={(patch) => saveDelivery(trackingFor, patch)} />
      )}
    </>
  );
}
