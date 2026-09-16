import { useState } from 'react';
import { Link, NavLink, Outlet, useNavigate, useLocation } from 'react-router-dom';
import { Home, LayoutGrid, ShoppingCart, User, Store, LogOut, LogIn, UserPlus, ShoppingBag, ShieldCheck } from 'lucide-react';
import { APP_NAME } from '../../lib/config';
import { useAuth } from '../../context/AuthContext';
import { useCart } from '../../context/CartContext';
import { useToast } from '../../context/ToastContext';
import { SearchBar } from '../ui/SearchBar';
import { Dropdown } from '../ui/Dropdown';
import { Button } from '../ui/Button';
import { initials } from '../../lib/format';

function Brand() {
  return (
    <Link to="/" className="brand" aria-label={`${APP_NAME} home`}>
      <span className="brand-mark" aria-hidden="true"><ShoppingBag size={16} /></span>
      {APP_NAME}
    </Link>
  );
}

function AccountMenu() {
  const { user, isAuthenticated, isSeller, isAdmin, logout } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const items = isAuthenticated
    ? [
        { head: user.email },
        ...(isAdmin ? [{ label: 'Admin panel', icon: ShieldCheck, to: '/admin' }] : []),
        isSeller ? { label: 'Seller workspace', icon: Store, to: '/seller' } : isAdmin ? null : { label: 'Become a seller', icon: Store, to: '/seller/setup' },
        { sep: true },
        { label: 'Sign out', icon: LogOut, danger: true, onClick: async () => { await logout(); toast.success('Signed out'); navigate('/'); } },
      ].filter(Boolean)
    : [
        { label: 'Sign in', icon: LogIn, to: '/login' },
        { label: 'Create account', icon: UserPlus, to: '/register' },
      ];
  return (
    <Dropdown label="Account" items={items} trigger={(p) => (
      <button type="button" className="btn btn-ghost btn-icon" {...p}>
        {isAuthenticated ? <span className="avatar">{initials(user.name)}</span> : <User size={20} />}
      </button>
    )} />
  );
}

export function StorefrontLayout() {
  const cart = useCart();
  const navigate = useNavigate();
  const location = useLocation();
  const [q, setQ] = useState(new URLSearchParams(location.search).get('q') || '');
  const submitSearch = (value) => navigate(value ? `/products?q=${encodeURIComponent(value)}` : '/products');
  const isHomeOrCatalog = location.pathname === '/' || location.pathname === '/products';

  return (
    <>
      <header className="header">
        <div className="container header-inner">
          <Brand />
          <SearchBar className="header-search" value={q} onChange={setQ} onSubmit={submitSearch} />
          <nav className="header-nav" aria-label="Primary">
            <NavLink to="/products" className="nav-link">Products</NavLink>
            <Button variant="ghost" iconOnly to="/cart" className="cart-btn" aria-label={`Cart, ${cart.count} items`}>
              <ShoppingCart size={20} />
              {cart.count > 0 && <span className="cart-count num" aria-hidden="true">{cart.count > 99 ? '99+' : cart.count}</span>}
            </Button>
            <AccountMenu />
          </nav>
        </div>
        {isHomeOrCatalog && (
          <div className="container mobile-search"><SearchBar value={q} onChange={setQ} onSubmit={submitSearch} /></div>
        )}
      </header>

      <main className="main" id="main">
        <div className="container"><Outlet /></div>
      </main>

      <footer className="footer">
        <div className="container footer-inner">
          <span>© {new Date().getFullYear()} {APP_NAME}</span>
          <span>Payments secured by Razorpay. Checkout verified over WhatsApp.</span>
          <nav className="row wrap" aria-label="Legal" style={{ gap: 'var(--s-4)' }}>
            <Link to="/track-order">Track order</Link>
            <Link to="/terms">Terms</Link>
            <Link to="/privacy">Privacy</Link>
            <Link to="/refunds">Refunds</Link>
          </nav>
        </div>
      </footer>

      <nav className="tabbar" aria-label="Mobile">
        <NavLink to="/" end><Home size={20} />Home</NavLink>
        <NavLink to="/products"><LayoutGrid size={20} />Products</NavLink>
        <NavLink to="/cart" aria-label={`Cart, ${cart.count} items`}>
          <ShoppingCart size={20} />Cart
          {cart.count > 0 && <span className="cart-count num" aria-hidden="true">{cart.count}</span>}
        </NavLink>
        <NavLink to="/account"><User size={20} />Account</NavLink>
      </nav>
    </>
  );
}
