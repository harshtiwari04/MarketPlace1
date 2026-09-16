import { Link, useParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { admin } from '../../lib/endpoints';
import { useAsync } from '../../hooks/useAsync';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { formatDate, formatMoney } from '../../lib/format';
import { Card, StatCard } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Skeleton } from '../../components/ui/Skeleton';
import { ErrorState } from '../../components/ui/States';
import { RoleBadge } from './UsersPage';

const dateTime = (d) => (d ? new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(d)) : '—');

export default function AdminUserDetailPage() {
  const { id } = useParams();
  const { data, loading, error, reload } = useAsync((s) => admin.users.detail(id, { signal: s }), [id]);
  useDocumentTitle(data ? `Admin · ${data.user.name}` : 'Admin · User');
  if (error) return <ErrorState error={error} onRetry={reload} />;
  if (loading || !data) return <div className="stack"><Skeleton w="40%" h={28} /><Skeleton h={120} r={10} /></div>;
  const { user, stats } = data;
  return (
    <>
      <nav className="breadcrumb" aria-label="Breadcrumb"><Link to="/admin/users"><ArrowLeft size={14} /> Users</Link></nav>
      <div className="page-head">
        <div><h1 className="page-title">{user.name}</h1><p className="text-muted">{user.email}{user.phone && ` · ${user.phone}`}</p></div>
        <div className="row"><RoleBadge role={user.role} />{user.isSuspended && <Badge tone="danger">Suspended</Badge>}</div>
      </div>
      <div className="stats-grid" style={{ marginBottom: 'var(--s-6)' }}>
        <StatCard label="Paid orders" value={stats.paidOrders} />
        <StatCard label="Total spent" value={formatMoney(stats.totalSpent)} />
        <StatCard label="Active sessions" value={stats.activeSessions} note="Devices currently signed in" />
        <StatCard label="Logins" value={user.loginCount} note={`Last ${dateTime(user.lastLoginAt)}`} />
      </div>
      <div className="order-grid">
        <Card title="Account">
          <dl className="order-kv">
            <div><dt>Joined</dt><dd>{formatDate(user.createdAt)}</dd></div>
            <div><dt>Email verified</dt><dd>{user.isEmailVerified ? 'Yes' : 'No'}</dd></div>
            <div><dt>Phone verified</dt><dd>{user.isPhoneVerified ? 'Yes' : 'No'}</dd></div>
            <div><dt>Google linked</dt><dd>{user.googleLinked ? 'Yes' : 'No'}</dd></div>
            {user.storeName && <div><dt>Store</dt><dd>{user.storeName}</dd></div>}
          </dl>
        </Card>
        <Card title="Actions">
          <div className="stack">
            {user.role === 'seller' && <Button variant="secondary" to={`/admin/products?sellerId=${user.id}&includeInactive=true`}>View listings</Button>}
            <Button variant="secondary" to={`/admin/orders?q=${encodeURIComponent(user.email || user.phone || '')}`}>Orders as buyer</Button>
            {user.role === 'seller' && <Button variant="secondary" to={`/admin/orders?sellerId=${user.id}`}>Orders as seller</Button>}
            <p className="text-xs text-muted">Role and suspension are managed from the Users list.</p>
          </div>
        </Card>
      </div>
    </>
  );
}
