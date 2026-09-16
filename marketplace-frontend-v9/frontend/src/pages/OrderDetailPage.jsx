import { Link, useParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { orders } from '../lib/endpoints';
import { useAsync } from '../hooks/useAsync';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { formatDate } from '../lib/format';
import { Card } from '../components/ui/Card';
import { Alert } from '../components/ui/Alert';
import { Skeleton } from '../components/ui/Skeleton';
import { ErrorState } from '../components/ui/States';
import { OrderView } from '../components/orders/OrderView';

/** Signed-in buyer's order detail. Ownership is enforced server-side (404 for anyone else's order). */
export default function OrderDetailPage() {
  const { id } = useParams();
  const { data: order, loading, error, reload } = useAsync((s) => orders.detail(id, { signal: s }), [id]);
  useDocumentTitle(order ? `Order ${order.orderId}` : 'Order');

  if (error) return <ErrorState error={error} onRetry={reload} />;
  if (loading || !order) return <div className="stack"><Skeleton w="40%" h={28} /><Skeleton h={200} r={10} /></div>;

  return (
    <>
      <nav className="breadcrumb" aria-label="Breadcrumb"><Link to="/orders"><ArrowLeft size={14} /> My orders</Link></nav>
      <div className="page-head">
        <div><h1 className="page-title num">{order.orderId}</h1><p className="text-muted">Placed {formatDate(order.createdAt)}</p></div>
      </div>
      {order.payment.status === 'pending' && (
        <Alert tone="warning" title="Payment not completed">If you closed the payment window, this order won’t be processed. Place a new order to try again.</Alert>
      )}
      <OrderView order={order} />
      <Card>
        <p className="text-sm text-muted" style={{ margin: 0 }}>Need help with this order? Quote <span className="num fw-600">{order.orderId}</span> when you contact us.</p>
      </Card>
    </>
  );
}
