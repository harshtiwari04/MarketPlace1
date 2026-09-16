import { Card } from '../ui/Card';
import { AddressBlock, OrderItemsList, OrderTimeline, PaymentBlock } from './OrderParts';

/**
 * Buyer-facing order body shared by the signed-in detail page and guest tracking.
 * With one item, the timeline is the item's; with several, each item's badge shows its own
 * status while the order-level timeline follows the least-advanced item (mirrors the backend).
 */
export function OrderView({ order }) {
  return (
    <div className="order-grid" style={{ marginTop: 'var(--s-4)', marginBottom: 'var(--s-4)' }}>
      <div className="stack">
        <Card title="Progress">
          <OrderTimeline status={order.status} history={order.statusHistory} />
          {order.items.length > 1 && (
            <p className="text-xs text-muted" style={{ marginTop: 'var(--s-3)' }}>
              Items from different sellers ship separately — each item below shows its own status.
            </p>
          )}
        </Card>
        <Card title={`Items (${order.items.length})`}>
          <OrderItemsList items={order.items} showStatus={order.items.length > 1 || order.items[0]?.status !== order.status} />
          {!order.items.some((i) => i.delivery?.trackingNumber || i.delivery?.trackingUrl) && order.status !== 'delivered' && order.status !== 'cancelled' && (
            <p className="text-xs text-muted" style={{ marginTop: 'var(--s-3)' }}>Courier and tracking details appear here once the seller dispatches your items.</p>
          )}
        </Card>
      </div>
      <div className="stack">
        <Card title="Delivery address"><AddressBlock address={order.shippingAddress} phone={order.buyer.phone} email={order.buyer.email} /></Card>
        <Card title="Payment"><PaymentBlock payment={order.payment} totalAmount={order.totalAmount} /></Card>
      </div>
    </div>
  );
}
