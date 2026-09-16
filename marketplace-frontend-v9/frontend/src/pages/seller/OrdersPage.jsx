import { Link, useSearchParams } from 'react-router-dom';
import { ClipboardList, ChevronRight } from 'lucide-react';
import { sellerOrders } from '../../lib/endpoints';
import { useAsync } from '../../hooks/useAsync';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { useMediaQuery } from '../../hooks/useMediaQuery';
import { formatMoney, formatDate } from '../../lib/format';
import { ORDER_STATUSES, statusLabel } from '../../lib/orderStatus';
import { Button } from '../../components/ui/Button';
import { Tabs } from '../../components/ui/Tabs';
import { Select } from '../../components/ui/FormField';
import { Pagination } from '../../components/ui/Pagination';
import { EmptyState, ErrorState } from '../../components/ui/States';
import { TableSkeleton } from '../../components/ui/Skeleton';
import { OrderStatusBadge, PaymentBadge } from '../../components/orders/OrderParts';

const LIMIT = 20;
// "Needs action" buckets a seller actually works from, plus a catch-all.
const TABS = [
  { value: '', label: 'All' },
  { value: 'confirmed', label: 'To pack' },
  { value: 'packed', label: 'To ship' },
  { value: 'out_for_delivery', label: 'In transit' },
  { value: 'delivered', label: 'Delivered' },
  { value: 'cancelled', label: 'Cancelled' },
];

export default function OrdersPage() {
  useDocumentTitle('Orders');
  const [params, setParams] = useSearchParams();
  const status = params.get('status') || '';
  const paymentStatus = params.get('paymentStatus') || '';
  const page = Math.max(1, Number(params.get('page') || 1));
  const isMobile = useMediaQuery('(max-width: 767px)');

  const update = (patch) => {
    const next = new URLSearchParams(params);
    Object.entries(patch).forEach(([k, v]) => (v ? next.set(k, v) : next.delete(k)));
    if (!('page' in patch)) next.delete('page');
    setParams(next);
  };

  const { data, loading, error, reload } = useAsync(
    (s) => sellerOrders.list({ status, paymentStatus, page, limit: LIMIT }, { signal: s }),
    [status, paymentStatus, page],
  );
  const list = data?.items || [];
  const hasFilters = status || paymentStatus;

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">Orders</h1>
          {data && !loading && <p className="num">{data.total} {data.total === 1 ? 'order' : 'orders'}{hasFilters ? ' matching' : ''}</p>}
        </div>
      </div>

      <div className="catalog-toolbar">
        <Tabs tabs={TABS} value={status} onChange={(v) => update({ status: v })} />
        <div className="catalog-controls">
          <Select value={paymentStatus} onChange={(e) => update({ paymentStatus: e.target.value })} aria-label="Filter by payment">
            <option value="">Any payment</option>
            <option value="paid">Paid</option>
            <option value="pending">Payment pending</option>
            <option value="failed">Payment failed</option>
          </Select>
        </div>
      </div>

      {error ? <ErrorState error={error} onRetry={reload} />
        : loading ? <TableSkeleton rows={6} />
        : list.length === 0 ? (
          <EmptyState icon={ClipboardList} title={hasFilters ? 'No orders match' : 'No orders yet'}
            action={hasFilters && <Button variant="secondary" onClick={() => setParams({})}>Clear filters</Button>}>
            {hasFilters ? 'Try another status or payment filter.' : 'Orders containing your products will appear here as soon as buyers check out.'}
          </EmptyState>
        ) : (
          <div className="stack" style={{ gap: 'var(--s-6)' }}>
            {isMobile ? (
              <div className="mobile-cards">
                {list.map((o) => (
                  <Link key={o.id} to={`/seller/orders/${o.orderId}`} className="mobile-card">
                    <div className="grow" style={{ minWidth: 0 }}>
                      <div className="row-between"><span className="num fw-600 text-sm">{o.orderId}</span><OrderStatusBadge status={o.items[0]?.status || o.status} /></div>
                      <div className="text-xs text-muted">{formatDate(o.createdAt)} · {o.items.length} {o.items.length === 1 ? 'item' : 'items'} · {o.buyer.phone}</div>
                    </div>
                    <div className="num fw-600 text-sm">{formatMoney(o.yourSubtotal ?? o.totalAmount)}</div>
                    <ChevronRight size={16} className="text-muted" />
                  </Link>
                ))}
              </div>
            ) : (
              <div className="table-wrap">
                <table className="table">
                  <thead><tr><th>Order</th><th>Placed</th><th>Buyer</th><th>Your items</th><th>Item status</th><th>Payment</th><th className="td-num">Your total</th><th><span className="sr-only">Actions</span></th></tr></thead>
                  <tbody>
                    {list.map((o) => {
                      // Seller sees one badge per distinct status among their own lines.
                      const statuses = [...new Set(o.items.map((i) => i.status))];
                      return (
                        <tr key={o.id}>
                          <td className="num fw-600">{o.orderId}</td>
                          <td className="text-muted">{formatDate(o.createdAt)}</td>
                          <td className="num">{o.buyer.phone}</td>
                          <td><span className="truncate" style={{ maxWidth: 260, display: 'inline-block' }}>{o.items.map((i) => `${i.quantity}× ${i.title}`).join(', ')}</span></td>
                          <td><div className="row wrap" style={{ gap: 'var(--s-1)' }}>{statuses.map((s) => <OrderStatusBadge key={s} status={s} />)}</div></td>
                          <td><PaymentBadge status={o.payment.status} /></td>
                          <td className="td-num num">{formatMoney(o.yourSubtotal ?? o.totalAmount)}</td>
                          <td className="td-actions"><Button variant="ghost" size="sm" to={`/seller/orders/${o.orderId}`}>Open</Button></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
            <Pagination page={data.page} total={data.total} limit={data.limit} onChange={(p) => { update({ page: String(p) }); window.scrollTo({ top: 0 }); }} />
          </div>
        )}
      <p className="text-xs text-muted" style={{ marginTop: 'var(--s-6)' }}>
        The status filter matches <em>your</em> line items. {ORDER_STATUSES.map(statusLabel).join(' → ').replace(' → Cancelled', '')}; cancelled is available until an item is out for delivery.
      </p>
    </>
  );
}
