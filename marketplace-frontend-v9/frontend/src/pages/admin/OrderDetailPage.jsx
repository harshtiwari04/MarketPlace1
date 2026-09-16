import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Truck } from 'lucide-react';
import { admin } from '../../lib/endpoints';
import { useAsync } from '../../hooks/useAsync';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { useToast } from '../../context/ToastContext';
import { formatDate } from '../../lib/format';
import { ACTION_LABELS, TRANSITIONS, canEditDelivery, statusLabel } from '../../lib/orderStatus';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { Alert } from '../../components/ui/Alert';
import { ConfirmDialog } from '../../components/ui/Modal';
import { Skeleton } from '../../components/ui/Skeleton';
import { ErrorState } from '../../components/ui/States';
import { AddressBlock, OrderItemsList, OrderStatusBadge, OrderTimeline, PaymentBlock, PaymentBadge } from '../../components/orders/OrderParts';
import { DeliveryForm } from '../../components/orders/DeliveryParts';

/**
 * Admin view of one order: every seller's items, who fulfils each line, and the same status /
 * tracking controls sellers have — for support interventions. All changes are audit-logged server-side.
 */
export default function AdminOrderDetailPage() {
  const { id } = useParams();
  const { data: order, loading, error, reload } = useAsync((s) => admin.orders.detail(id, { signal: s }), [id]);
  useDocumentTitle(order ? `Admin · ${order.orderId}` : 'Admin · Order');
  const toast = useToast();
  const [busy, setBusy] = useState(null);
  const [confirmCancel, setConfirmCancel] = useState(null);
  const [trackingFor, setTrackingFor] = useState(null);
  const [local, setLocal] = useState(null);
  const view = local || order;

  const move = async (item, status) => {
    setBusy(item.productId);
    try {
      setLocal(await admin.orders.updateItemStatus(view.orderId, item.productId, status));
      toast.success(`${item.title}: ${statusLabel(status)}`);
    } catch (err) { toast.error(err.message); } finally { setBusy(null); setConfirmCancel(null); }
  };
  const saveDelivery = async (item, patch) => {
    setLocal(await admin.orders.updateItemDelivery(view.orderId, item.productId, patch));
    toast.success('Tracking details saved');
  };

  const renderAction = (item) => {
    const next = TRANSITIONS[item.status] || [];
    const unpaid = view.payment.status !== 'paid';
    const tracking = canEditDelivery(item) && !unpaid ? <Button key="t" size="sm" variant="secondary" icon={Truck} onClick={() => setTrackingFor(item)} disabled={!!busy}>{item.delivery?.trackingNumber ? 'Edit tracking' : 'Add tracking'}</Button> : null;
    return [tracking, ...next.map((status) => {
      const isCancel = status === 'cancelled';
      return <Button key={status} size="sm" variant={isCancel ? 'ghost' : 'primary'} loading={busy === item.productId} disabled={(unpaid && !isCancel) || (busy && busy !== item.productId)} onClick={() => (isCancel ? setConfirmCancel(item) : move(item, status))}>{ACTION_LABELS[status]}</Button>;
    })];
  };
  const renderMeta = (item) => item.sellerInfo ? <>Seller: <Link to={`/admin/users/${item.sellerInfo.id}`}>{item.sellerInfo.storeName || item.sellerInfo.name}</Link>{item.category && <> · {item.category}</>}</> : null;

  if (error) return <ErrorState error={error} onRetry={reload} />;
  if (loading || !view) return <div className="stack"><Skeleton w="40%" h={28} /><Skeleton h={180} r={10} /><Skeleton h={120} r={10} /></div>;

  return (
    <>
      <nav className="breadcrumb" aria-label="Breadcrumb"><Link to="/admin/orders"><ArrowLeft size={14} /> Orders</Link></nav>
      <div className="page-head">
        <div><h1 className="page-title num">{view.orderId}</h1><p className="text-muted">Placed {formatDate(view.createdAt)} · <PaymentBadge status={view.payment.status} /> · {view.buyer.isGuest ? 'Guest checkout' : 'Registered buyer'}</p></div>
        <OrderStatusBadge status={view.status} />
      </div>
      {view.payment.status !== 'paid' && <Alert tone="warning" title="Payment not captured">Items can only be cancelled until payment is captured.</Alert>}
      {view.payment.refundId && <Alert tone="info" title="Refunded">Refund reference {view.payment.refundId}.</Alert>}

      <div className="order-grid" style={{ marginTop: 'var(--s-4)' }}>
        <div className="stack">
          <Card title={`Items (${view.items.length})`}><OrderItemsList items={view.items} renderAction={renderAction} renderMeta={renderMeta} /></Card>
          <Card title="Order progress"><OrderTimeline status={view.status} history={view.statusHistory} /><p className="text-xs text-muted" style={{ marginTop: 'var(--s-3)' }}>Order status follows the least-advanced non-cancelled item.</p></Card>
        </div>
        <div className="stack">
          <Card title="Ship to"><AddressBlock address={view.shippingAddress} phone={view.buyer.phone} email={view.buyer.email} /></Card>
          <Card title="Payment"><PaymentBlock payment={view.payment} totalAmount={view.totalAmount} /></Card>
        </div>
      </div>

      <ConfirmDialog open={!!confirmCancel} onCancel={() => setConfirmCancel(null)} onConfirm={() => move(confirmCancel, 'cancelled')} title="Cancel this item?" confirmLabel="Cancel item" danger loading={!!busy}>
        {confirmCancel?.title} will be marked cancelled for the buyer and the seller. Refunds are handled separately in Razorpay.
      </ConfirmDialog>
      {trackingFor && <DeliveryForm open item={trackingFor} onClose={() => setTrackingFor(null)} onSave={(patch) => saveDelivery(trackingFor, patch)} />}
    </>
  );
}
