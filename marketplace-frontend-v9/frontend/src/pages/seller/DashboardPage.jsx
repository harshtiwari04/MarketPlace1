import { Link } from 'react-router-dom';
import { ImageOff, PlusCircle, Package, ArrowRight } from 'lucide-react';
import { sellerProducts, sellerOrders } from '../../lib/endpoints';
import { OrderStatusBadge } from '../../components/orders/OrderParts';
import { useAsync } from '../../hooks/useAsync';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { useAuth } from '../../context/AuthContext';
import { formatMoney, formatDate, titleCase } from '../../lib/format';
import { StatCard, Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { EmptyState, ErrorState } from '../../components/ui/States';
import { TableSkeleton } from '../../components/ui/Skeleton';
import { Badge } from '../../components/ui/Badge';

/**
 * Product stats come from the seller's product list; order stats from /seller/orders, which only
 * ever returns this seller's own line items (so "to pack" and "paid revenue" are theirs alone).
 */
export default function DashboardPage() {
  useDocumentTitle('Dashboard');
  const { user } = useAuth();
  const { data: products, loading, error, reload } = useAsync((s) => sellerProducts.list({ limit: 60 }, { signal: s }), []);
  const { data: summary, loading: summaryLoading } = useAsync((s) => sellerProducts.summary({ signal: s }), []);
  // Two small queries instead of paging the whole order table: what needs packing now, and recent activity.
  const { data: toPack, loading: loadingPack } = useAsync((s) => sellerOrders.list({ status: 'confirmed', paymentStatus: 'paid', limit: 1 }, { signal: s }), []);
  const { data: recentOrders, loading: loadingOrders } = useAsync((s) => sellerOrders.list({ limit: 5 }, { signal: s }), []);

  const list = products?.items || [];
  const categories = new Set(list.map((p) => p.category));
  const withoutImages = list.filter((p) => p.images.length === 0).length;
  const recent = [...list].sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0)).slice(0, 5);

  return (
    <>
      <div className="page-head">
        <div><h1 className="page-title">Hello, {user?.name?.split(' ')[0]}</h1><p>{user?.storeName ? `Here is how ${user.storeName} looks today.` : 'Here is your store at a glance.'}</p></div>
        <Button to="/seller/products/new" icon={PlusCircle}>Add product</Button>
      </div>

      {error ? <ErrorState error={error} onRetry={reload} /> : (
        <div className="stack" style={{ gap: 'var(--s-6)' }}>
          <div className="stats-grid">
            <StatCard label="Listed products" value={list.length} loading={loading} />
            <StatCard label="Categories" value={categories.size} loading={loading} />
            <StatCard label="Missing photos" value={withoutImages} loading={loading} note={withoutImages ? 'Listings with photos sell better' : undefined} />
            <StatCard label="Orders to pack" value={toPack?.total ?? '—'} loading={loadingPack} note={toPack?.total ? 'Paid and waiting on you' : undefined} />
            <StatCard label="Low stock" value={summary?.lowStockCount ?? '—'} loading={summaryLoading} note={summary?.lowStockCount ? 'Restock soon' : undefined} />
            <StatCard label="Lifetime revenue" value={summary ? formatMoney(summary.totalRevenue) : '—'} loading={summaryLoading} note={summary ? `${summary.totalSold} units sold` : undefined} />
          </div>

          <Card title="Latest orders" action={recentOrders?.items?.length > 0 && <Link to="/seller/orders" className="text-sm fw-600" style={{ color: 'var(--primary)' }}>All orders <ArrowRight size={14} style={{ verticalAlign: -2 }} /></Link>} padded={false}>
            {loadingOrders ? <div className="card-body"><TableSkeleton rows={3} /></div>
              : !recentOrders?.items?.length ? <div className="card-body text-sm text-muted">No orders yet. They’ll show here the moment a buyer checks out with one of your products.</div>
              : (
                <div className="mobile-cards" style={{ padding: 'var(--s-2)' }}>
                  {recentOrders.items.map((o) => (
                    <Link key={o.id} to={`/seller/orders/${o.orderId}`} className="mobile-card">
                      <div className="grow" style={{ minWidth: 0 }}>
                        <div className="num fw-600 text-sm">{o.orderId}</div>
                        <div className="text-xs text-muted truncate">{o.items.map((i) => `${i.quantity}× ${i.title}`).join(', ')}</div>
                      </div>
                      <OrderStatusBadge status={o.items[0]?.status || o.status} />
                      <div className="num fw-600 text-sm">{formatMoney(o.yourSubtotal ?? o.totalAmount)}</div>
                    </Link>
                  ))}
                </div>
              )}
          </Card>

          <Card title="Recently added" action={list.length > 0 && <Link to="/seller/products" className="text-sm fw-600" style={{ color: 'var(--primary)' }}>All products <ArrowRight size={14} style={{ verticalAlign: -2 }} /></Link>} padded={false}>
            {loading ? <div className="card-body"><TableSkeleton rows={3} /></div>
              : list.length === 0 ? (
                <div className="card-body">
                  <EmptyState icon={Package} title="No products yet" action={<Button to="/seller/products/new" icon={PlusCircle}>Add your first product</Button>}>
                    Add a title, price and a few photos — it takes about a minute.
                  </EmptyState>
                </div>
              ) : (
                <div>
                  {recent.map((p) => (
                    <Link key={p.id} to={`/seller/products/${p.id}/edit`} className="row-between" style={{ padding: 'var(--s-3) var(--s-5)', borderBottom: '1px solid var(--line)' }}>
                      <div className="seller-product-row">
                        <span className="seller-thumb">{p.images[0]?.url ? <img src={p.images[0].url} alt="" loading="lazy" /> : <ImageOff size={16} />}</span>
                        <div style={{ minWidth: 0 }}><div className="fw-600 text-sm truncate">{p.title}</div><div className="text-xs text-muted">{titleCase(p.category)} · {formatDate(p.createdAt)}</div></div>
                      </div>
                      <div className="row"><span className="num fw-600 text-sm">{formatMoney(p.price)}</span>{p.images.length === 0 && <Badge tone="warning">No photo</Badge>}</div>
                    </Link>
                  ))}
                </div>
              )}
          </Card>
        </div>
      )}
    </>
  );
}
