import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { admin } from '../../lib/endpoints';
import { useAsync } from '../../hooks/useAsync';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { formatMoney, titleCase } from '../../lib/format';
import { statusLabel } from '../../lib/orderStatus';
import { StatCard, Card } from '../../components/ui/Card';
import { Select } from '../../components/ui/FormField';
import { ErrorState } from '../../components/ui/States';
import { Skeleton, TableSkeleton } from '../../components/ui/Skeleton';
import { OrderStatusBadge } from '../../components/orders/OrderParts';
import { RangePicker, defaultRange, rangeParams } from '../../components/admin/RangePicker';
import { CategoryBars, RevenueSpark } from '../../components/admin/Charts';

const pct = (a, b) => (b ? `${Math.round((a / b) * 100)}%` : '—');

/**
 * Admin overview. Each widget is its own request so a slow aggregation never blocks the KPIs.
 * All numbers share one date range; "recognised revenue" excludes cancelled/refunded lines.
 */
export default function AdminDashboardPage() {
  useDocumentTitle('Admin · Overview');
  const [range, setRange] = useState(defaultRange);
  const [granularity, setGranularity] = useState('day');
  const params = rangeParams(range);

  const overview = useAsync((s) => admin.overview(params, { signal: s }), [range.from, range.to]);
  const byCategory = useAsync((s) => admin.revenueByCategory(params, { signal: s }), [range.from, range.to]);
  const series = useAsync((s) => admin.revenueTimeseries({ ...params, granularity }, { signal: s }), [range.from, range.to, granularity]);
  const topProducts = useAsync((s) => admin.topProducts({ ...params, limit: 5 }, { signal: s }), [range.from, range.to]);
  const topSellers = useAsync((s) => admin.topSellers({ ...params, limit: 5 }, { signal: s }), [range.from, range.to]);

  const o = overview.data;

  return (
    <>
      <div className="page-head">
        <div><h1 className="page-title">Overview</h1><p>Marketplace-wide metrics for the selected period.</p></div>
        <RangePicker value={range} onChange={setRange} />
      </div>

      {overview.error ? <ErrorState error={overview.error} onRetry={overview.reload} /> : (
        <div className="stack" style={{ gap: 'var(--s-6)' }}>
          <section aria-labelledby="kpi-users">
            <h2 id="kpi-users" className="text-sm text-muted fw-600" style={{ marginBottom: 'var(--s-2)' }}>Users</h2>
            <div className="stats-grid">
              <StatCard label="Registered users" value={o?.users.total ?? '—'} loading={overview.loading} note={o ? `${o.users.byRole.buyer ?? 0} buyers · ${o.users.byRole.seller ?? 0} sellers · ${o.users.byRole.admin ?? 0} admins` : undefined} />
              <StatCard label="Logged in right now" value={o?.users.currentlyLoggedIn ?? '—'} loading={overview.loading} note="Accounts with a live session on any device" />
              <StatCard label="Active (7 days)" value={o?.users.activeLast7d ?? '—'} loading={overview.loading} note={o ? `${o.users.activeLast24h} in the last 24h` : undefined} />
              <StatCard label="New in period" value={o?.users.newInRange ?? '—'} loading={overview.loading} note={o ? `${pct(o.users.verified, o.users.total)} of all users verified${o.users.suspended ? ` · ${o.users.suspended} suspended` : ''}` : undefined} />
            </div>
          </section>

          <section aria-labelledby="kpi-orders">
            <h2 id="kpi-orders" className="text-sm text-muted fw-600" style={{ marginBottom: 'var(--s-2)' }}>Orders & revenue</h2>
            <div className="stats-grid">
              <StatCard label="Recognised revenue" value={o ? formatMoney(o.revenue.recognised) : '—'} loading={overview.loading} note={o ? `${o.revenue.unitsSold} units · gross ${formatMoney(o.revenue.grossPaid)}` : undefined} />
              <StatCard label="Paid orders" value={o?.orders.paidInRange ?? '—'} loading={overview.loading} note={o ? `${o.orders.inRange} placed · AOV ${formatMoney(o.orders.averageOrderValue)}` : undefined} />
              <StatCard label="Refunded / cancelled value" value={o ? formatMoney(o.revenue.cancelledOnPaid) : '—'} loading={overview.loading} note="Cancelled lines on paid orders" />
              <StatCard label="Total orders (all time)" value={o?.orders.total ?? '—'} loading={overview.loading} note={o ? `${o.sellers.withSalesInRange}/${o.sellers.total} sellers sold in period` : undefined} />
            </div>
          </section>

          <div className="order-grid">
            <Card title="Revenue by category" action={byCategory.data && <span className="text-sm text-muted num">Total {formatMoney(byCategory.data.total)}</span>}>
              {byCategory.error ? <ErrorState error={byCategory.error} onRetry={byCategory.reload} compact />
                : byCategory.loading ? <TableSkeleton rows={4} />
                : <CategoryBars rows={byCategory.data.categories} total={byCategory.data.total} />}
            </Card>
            <Card title="Orders by status">
              {overview.loading ? <TableSkeleton rows={4} /> : (
                <dl className="order-kv">
                  {Object.entries(o?.orders.byStatus ?? {}).map(([s, n]) => (
                    <div key={s}><dt><OrderStatusBadge status={s} /></dt><dd className="num fw-600">{n}</dd></div>
                  ))}
                  <div style={{ borderTop: '1px solid var(--line)', paddingTop: 'var(--s-2)' }}><dt className="text-muted">Payment</dt><dd className="text-sm num">{Object.entries(o?.orders.byPaymentStatus ?? {}).map(([k, v]) => `${titleCase(k)} ${v}`).join(' · ') || '—'}</dd></div>
                </dl>
              )}
            </Card>
          </div>

          <Card title="Revenue over time" action={
            <Select value={granularity} onChange={(e) => setGranularity(e.target.value)} aria-label="Granularity" style={{ width: 'auto' }}>
              <option value="day">Daily</option><option value="week">Weekly</option><option value="month">Monthly</option>
            </Select>}>
            {series.error ? <ErrorState error={series.error} onRetry={series.reload} compact /> : series.loading ? <Skeleton h={140} r={8} /> : <RevenueSpark points={series.data.points} />}
          </Card>

          <div className="order-grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <Card title="Top products" padded={false} action={<Link to="/admin/products" className="text-sm fw-600" style={{ color: 'var(--primary)' }}>All products <ArrowRight size={14} style={{ verticalAlign: -2 }} /></Link>}>
              {topProducts.loading ? <div className="card-body"><TableSkeleton rows={3} /></div> : !topProducts.data?.length ? <div className="card-body text-sm text-muted">Nothing sold yet.</div> : (
                <div className="table-wrap"><table className="table">
                  <thead><tr><th>Product</th><th>Category</th><th className="td-num">Units</th><th className="td-num">Revenue</th></tr></thead>
                  <tbody>{topProducts.data.map((p) => (
                    <tr key={p.productId}><td className="fw-600 truncate" style={{ maxWidth: 220 }}>{p.title}</td><td className="text-muted" style={{ textTransform: 'capitalize' }}>{p.category}</td><td className="td-num num">{p.units}</td><td className="td-num num">{formatMoney(p.revenue)}</td></tr>
                  ))}</tbody>
                </table></div>
              )}
            </Card>
            <Card title="Top sellers" padded={false} action={<Link to="/admin/users?role=seller" className="text-sm fw-600" style={{ color: 'var(--primary)' }}>All sellers <ArrowRight size={14} style={{ verticalAlign: -2 }} /></Link>}>
              {topSellers.loading ? <div className="card-body"><TableSkeleton rows={3} /></div> : !topSellers.data?.length ? <div className="card-body text-sm text-muted">No seller has sales in this period.</div> : (
                <div className="table-wrap"><table className="table">
                  <thead><tr><th>Store</th><th className="td-num">Orders</th><th className="td-num">Revenue</th></tr></thead>
                  <tbody>{topSellers.data.map((s) => (
                    <tr key={s.sellerId}><td><Link to={`/admin/users/${s.sellerId}`} className="fw-600">{s.storeName || s.name || s.sellerId}</Link></td><td className="td-num num">{s.orders}</td><td className="td-num num">{formatMoney(s.revenue)}</td></tr>
                  ))}</tbody>
                </table></div>
              )}
            </Card>
          </div>

          <p className="text-xs text-muted">
            Recognised revenue = paid orders, excluding cancelled line items (automatic oversell refunds count as ₹0). Date filters apply to when the order was placed. Statuses: {['placed', 'confirmed', 'packed', 'out_for_delivery', 'delivered'].map(statusLabel).join(' → ')}.
          </p>
        </div>
      )}
    </>
  );
}
