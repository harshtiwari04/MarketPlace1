import { Link, useSearchParams } from 'react-router-dom';
import { PackageSearch, ChevronRight } from 'lucide-react';
import { orders } from '../lib/endpoints';
import { useAsync } from '../hooks/useAsync';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { formatMoney, formatDate } from '../lib/format';
import { Button } from '../components/ui/Button';
import { Tabs } from '../components/ui/Tabs';
import { Pagination } from '../components/ui/Pagination';
import { EmptyState, ErrorState } from '../components/ui/States';
import { TableSkeleton } from '../components/ui/Skeleton';
import { OrderStatusBadge, PaymentBadge } from '../components/orders/OrderParts';

const LIMIT = 10;
const TABS = [
  { value: '', label: 'All' },
  { value: 'confirmed', label: 'Processing' },
  { value: 'out_for_delivery', label: 'On the way' },
  { value: 'delivered', label: 'Delivered' },
  { value: 'cancelled', label: 'Cancelled' },
];

/** Registered buyer's order history. Guests are pointed to /track-order instead. */
export default function OrdersPage() {
  useDocumentTitle('My orders');
  const [params, setParams] = useSearchParams();
  const status = params.get('status') || '';
  const page = Math.max(1, Number(params.get('page') || 1));

  const update = (patch) => {
    const next = new URLSearchParams(params);
    Object.entries(patch).forEach(([k, v]) => (v ? next.set(k, v) : next.delete(k)));
    if (!('page' in patch)) next.delete('page');
    setParams(next);
  };

  const { data, loading, error, reload } = useAsync((s) => orders.listMine({ status, page, limit: LIMIT }, { signal: s }), [status, page]);
  const list = data?.items || [];

  return (
    <>
      <div className="page-head">
        <div><h1 className="page-title">My orders</h1>{data && !loading && <p className="num">{data.total} {data.total === 1 ? 'order' : 'orders'}</p>}</div>
        <Button variant="secondary" size="sm" to="/track-order">Track a guest order</Button>
      </div>

      <Tabs tabs={TABS} value={status} onChange={(v) => update({ status: v })} />

      <div style={{ marginTop: 'var(--s-4)' }}>
        {error ? <ErrorState error={error} onRetry={reload} />
          : loading ? <TableSkeleton rows={4} />
          : list.length === 0 ? (
            <EmptyState icon={PackageSearch} title={status ? 'Nothing here' : 'No orders yet'}
              action={<Button to="/products">Browse products</Button>}>
              {status ? 'No orders with this status.' : 'Orders you place while signed in will show up here. Ordered as a guest? Use “Track a guest order”.'}
            </EmptyState>
          ) : (
            <div className="stack" style={{ gap: 'var(--s-6)' }}>
              <div className="stack">
                {list.map((o) => (
                  <Link key={o.id} to={`/orders/${o.orderId}`} className="order-card">
                    <div className="order-card-head">
                      <span className="num fw-600">{o.orderId}</span>
                      <span className="row" style={{ gap: 'var(--s-2)' }}><OrderStatusBadge status={o.status} /><PaymentBadge status={o.payment.status} /></span>
                    </div>
                    <div className="text-sm text-muted">{formatDate(o.createdAt)} · {o.items.length} {o.items.length === 1 ? 'item' : 'items'}</div>
                    <div className="text-sm truncate">{o.items.map((i) => i.title).join(', ')}</div>
                    <div className="row-between"><span className="num fw-600">{formatMoney(o.totalAmount)}</span><span className="text-sm text-muted row" style={{ gap: 4 }}>View <ChevronRight size={14} /></span></div>
                  </Link>
                ))}
              </div>
              <Pagination page={data.page} total={data.total} limit={data.limit} onChange={(p) => { update({ page: String(p) }); window.scrollTo({ top: 0 }); }} />
            </div>
          )}
      </div>
    </>
  );
}
