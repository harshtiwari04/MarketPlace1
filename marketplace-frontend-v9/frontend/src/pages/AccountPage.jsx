import { Link, useNavigate } from 'react-router-dom';
import { LogIn, LogOut, Store, UserPlus, ChevronRight, PackageSearch } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { initials } from '../lib/format';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { Alert } from '../components/ui/Alert';

/** Mobile "Account" tab: a plain page version of the header account menu. */
export default function AccountPage() {
  useDocumentTitle('Account');
  const { user, isAuthenticated, isSeller, logout, status } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  if (status === 'loading') return null;

  if (!isAuthenticated) {
    return (
      <>
        <div className="page-head"><h1 className="page-title">Account</h1></div>
        <Card><div className="stack">
          <p className="text-muted">Sign in to save your details and set up a store. You can still buy as a guest.</p>
          <Button to="/login" icon={LogIn} block>Sign in</Button>
          <Button to="/register" icon={UserPlus} variant="secondary" block>Create account</Button>
          <Button to="/track-order" icon={PackageSearch} variant="ghost" block>Track a guest order</Button>
        </div></Card>
      </>
    );
  }

  const goVerify = () => navigate(`/verify-email?email=${encodeURIComponent(user.email)}&autoSend=1`);

  const Row = ({ to, icon: Icon, children }) => (
    <Link to={to} className="menu-item" style={{ padding: 'var(--s-3) var(--s-5)', borderRadius: 0 }}><Icon size={18} />{children}<ChevronRight size={16} style={{ marginLeft: 'auto', color: 'var(--muted-2)' }} /></Link>
  );

  return (
    <>
      <div className="page-head"><h1 className="page-title">Account</h1></div>
      <div className="stack">
        {user.email && !user.isEmailVerified && (
          <Alert
            tone="warning"
            title="Verify your email"
            action={<Button size="sm" variant="secondary" onClick={goVerify}>Verify email</Button>}
          >
            We'll send a 6-digit code to {user.email} to confirm it's yours.
          </Alert>
        )}
        <Card><div className="row"><span className="avatar" style={{ width: 44, height: 44 }}>{initials(user.name)}</span><div><div className="fw-700">{user.name}</div><div className="text-sm text-muted">{user.email}</div></div></div></Card>
        <Card padded={false}>
          <Row to="/orders" icon={PackageSearch}>My orders</Row>
          {isSeller ? <Row to="/seller" icon={Store}>Seller workspace</Row> : <Row to="/seller/setup" icon={Store}>Become a seller</Row>}
        </Card>
        <Button variant="secondary" icon={LogOut} onClick={async () => { await logout(); toast.success('Signed out'); navigate('/'); }}>Sign out</Button>
      </div>
    </>
  );
}
