import { Link, useLocation, useParams } from 'react-router-dom';
import { CheckCircle2 } from 'lucide-react';
import { formatMinorUnits } from '../lib/format';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { Button } from '../components/ui/Button';
import { useAuth } from '../context/AuthContext';

export default function OrderSuccessPage() {
  useDocumentTitle('Order confirmed');
  const { orderId } = useParams();
  const { state } = useLocation();
  const { isAuthenticated } = useAuth();
  return (
    <div className="auth" style={{ minHeight: 'auto' }}>
      <div className="auth-card" style={{ maxWidth: 520, textAlign: 'center', alignItems: 'center' }}>
        <div className="state-icon" style={{ background: 'var(--primary-tint)', color: 'var(--primary)', width: 64, height: 64 }}><CheckCircle2 size={32} /></div>
        <div>
          <h1>Order confirmed</h1>
          <p className="lead">Your payment was verified and the order is now being prepared.</p>
        </div>
        <dl style={{ margin: 0, width: '100%', textAlign: 'left' }}>
          <div className="review-block"><dt>Order number</dt><dd className="num fw-600">{orderId}</dd></div>
          {state?.amount != null && <div className="review-block"><dt>Amount paid</dt><dd className="num fw-600">{formatMinorUnits(state.amount)}</dd></div>}
          {state?.paymentId && <div className="review-block"><dt>Payment reference</dt><dd className="num">{state.paymentId}</dd></div>}
        </dl>
        <p className="text-sm text-muted">Delivery updates will arrive on your WhatsApp number{state?.email ? ` and a receipt at ${state.email}` : ''}. Keep the order number handy for any questions.</p>
        <div className="row wrap" style={{ justifyContent: 'center' }}>
          <Button to={isAuthenticated ? `/orders/${orderId}` : `/track-order?orderId=${encodeURIComponent(orderId)}`}>Track this order</Button>
          <Button variant="secondary" to="/products">Continue shopping</Button>
        </div>
        <p className="text-xs text-muted">Not you? <Link to="/">Return to the store</Link>.</p>
      </div>
    </div>
  );
}
