import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ClipboardList, Search, ChevronRight } from 'lucide-react';
import { admin } from '../../lib/endpoints';
import { useAsync } from '../../hooks/useAsync';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { useMediaQuery } from '../../hooks/useMediaQuery';
import { formatDate, formatMoney } from '../../lib/format';
import { ORDER_STATUSES, statusLabel } from '../../lib/orderStatus';
import { Button } from '../../components/ui/Button';
import { Input, Select } from '../../components/ui/FormField';
import { Pagination } from '../../components/ui/Pagination';
import { Tabs } from '../../components/ui/Tabs';
import { EmptyState, ErrorState } from '../../components/ui/States';
import { TableSkeleton } from '../../components/ui/Skeleton';
import { OrderStatusBadge, PaymentBadge } from '../../components/orders/OrderParts';

const TABS = [{ value: '', label: 'All' }, ...ORDER_STATUSES.map((s) => ({ value: s, label: statusLabel(s) }))];

/** Every order on the marketplace, across all sellers. Status here is the order-level aggregate. */
export default function AdminOrdersPage() {
  useDocumentTitle('Admin · Orders');
  const isMobile = useMediaQuery('(max-width: 767px)');
  const [params, setParams] = useSearchParams();
  const status = params.get('status') || '';
  const paymentStatus = params.get('paymentStatus') || '';
  const q = params.get('q') || '';
  const sellerId = params.get('sellerId') || '';
  const page = Number(params.get('page') || 1);
  const [draft, setDraft] = useState(q);

  const update = (patch) => { const next = new URLSearchParams(params); Object.entries(patch).forEach(([k, v]) => (v ? next.set(k, v) : next.delete(k))); if (!('page' in patch)) next.delete('page'); setParams(next); };
  const query = { status: status || undefined, paymentStatus: paymentStatus || undefined, q: q || undefined, sellerId: sellerId || undefined, page, limit: 20 };
  const { data, loading, error, reload } = useAsync((s) => admin.orders.list(query, { signal: s }), [status, paymentStatus, q, sellerId, page]);
  const list = data?.items || [];
  const hasFilters = !!(status || paymentStatus || q || sellerId);

  return (
    <>
      <div className="page-head"><div><h1 className="page-title">Orders</h1><p>{data ? `${data.total} orders` : 'Every order across all sellers.'}</p></div></div>
      <div className="catalog-toolbar">
        <Tabs tabs={TABS} value={status} onChange={(v) => update({ status: v })} />
        <form className="catalog-controls" onSubmit={(e) => { e.preventDefault(); update({ q: draft }); }}>
          <Input icon={Search} value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Order id, phone, email, payment or tracking no." aria-label="Search orders" />
          <Select value={paymentStatus} onChange={(e) => update({ paymentStatus: e.target.value })} aria-label="Payment"><option value="">Any payment</option><option value="paid">Paid</option><option value="pending">Pending</option><option value="failed">Failed</option></Select>
          <Button type="submit" variant="secondary">Search</Button>
        </form>
      </div>
      {sellerId && <p className="text-sm text-muted">Filtered to one seller. <button type="button" className="btn btn-ghost btn-sm" onClick={() => update({ sellerId: '' })}>Show all</button></p>}

      {error ? <ErrorState error={error} onRetry={reload} /> : loading ? <TableSkeleton rows={8} /> : list.length === 0 ? (
        <EmptyState icon={ClipboardList} title={hasFilters ? 'No orders match' : 'No orders yet'} action={hasFilters && <Button variant="secondary" onClick={() => { setDraft(''); setParams({}); }}>Clear filters</Button>} />
      ) : (
        <div className="stack" style={{ gap: 'var(--s-6)' }}>
          {isMobile ? (
            <div className="mobile-cards">{list.map((o) => (
              <Link key={o.id} to={`/admin/orders/${o.orderId}`} className="mobile-card">
                <div className="grow" style={{ minWidth: 0 }}>
                  <div className="row-between"><span className="num fw-600 text-sm">{o.orderId}</span><OrderStatusBadge status={o.status} /></div>
                  <div className="text-xs text-muted">{formatDate(o.createdAt)} · {o.items.length} item{o.items.length === 1 ? '' : 's'} · {o.buyer.phone}</div>
                </div>
                <div className="num fw-600 text-sm">{formatMoney(o.totalAmount)}</div>
                <ChevronRight size={16} className="text-muted" />
              </Link>
            ))}</div>
          ) : (
            <div className="table-wrap"><table className="table">
              <thead><tr><th>Order</th><th>Placed</th><th>Buyer</th><th>Items</th><th>Status</th><th>Payment</th><th className="td-num">Total</th><th><span className="sr-only">Actions</span></th></tr></thead>
              <tbody>{list.map((o) => (
                <tr key={o.id}>
                  <td className="num fw-600">{o.orderId}</td>
                  <td className="text-muted">{formatDate(o.createdAt)}</td>
                  <td><span className="num">{o.buyer.phone}</span>{o.buyer.isGuest && <span className="text-xs text-muted"> · guest</span>}<div className="text-xs text-muted">{o.buyer.email}</div></td>
                  <td><span className="truncate" style={{ maxWidth: 240, display: 'inline-block' }}>{o.items.map((i) => `${i.quantity}× ${i.title}`).join(', ')}</span></td>
                  <td><OrderStatusBadge status={o.status} /></td>
                  <td><PaymentBadge status={o.payment.status} /></td>
                  <td className="td-num num">{formatMoney(o.totalAmount)}</td>
                  <td className="td-actions"><Button variant="ghost" size="sm" to={`/admin/orders/${o.orderId}`}>Open</Button></td>
                </tr>
              ))}</tbody>
            </table></div>
          )}
          <Pagination page={data.page} total={data.total} limit={data.limit} onChange={(p) => { update({ page: String(p) }); window.scrollTo({ top: 0 }); }} />
        </div>
      )}
    </>
  );
}
