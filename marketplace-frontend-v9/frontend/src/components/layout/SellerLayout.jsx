import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { LayoutDashboard, Package, PlusCircle, ArrowLeft, Menu, X, LogOut, ShoppingBag, ClipboardList } from 'lucide-react';
import { APP_NAME } from '../../lib/config';
import { useAuth } from '../../context/AuthContext';
import { Button } from '../ui/Button';
import { initials } from '../../lib/format';

const links = [
  { to: '/seller', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/seller/products', label: 'My products', icon: Package, end: true },
  { to: '/seller/products/new', label: 'Add product', icon: PlusCircle },
  { to: '/seller/orders', label: 'Orders', icon: ClipboardList },
];

function SideNav({ onNavigate }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  return (
    <>
      <Link to="/seller" className="brand" onClick={onNavigate}><span className="brand-mark"><ShoppingBag size={16} /></span>{APP_NAME}</Link>
      <nav className="sidebar-nav" aria-label="Seller">
        {links.map((l) => (
          <NavLink key={l.to} to={l.to} end={l.end} className="side-link" onClick={onNavigate}><l.icon size={18} aria-hidden="true" />{l.label}</NavLink>
        ))}
      </nav>
      <div className="sidebar-foot">
        <div className="row" style={{ padding: 'var(--s-2) var(--s-3)' }}>
          <span className="avatar">{initials(user?.name)}</span>
          <div className="grow" style={{ minWidth: 0 }}>
            <div className="text-sm fw-600 truncate">{user?.storeName || user?.name}</div>
            <div className="text-xs text-muted truncate">{user?.email}</div>
          </div>
        </div>
        <Link to="/" className="side-link" onClick={onNavigate}><ArrowLeft size={18} />Back to store</Link>
        <button type="button" className="side-link" style={{ border: 0, background: 'none', width: '100%' }} onClick={async () => { await logout(); navigate('/'); }}><LogOut size={18} />Sign out</button>
      </div>
    </>
  );
}

export function SellerLayout() {
  const [open, setOpen] = useState(false);
  const location = useLocation();
  useEffect(() => setOpen(false), [location.pathname]);

  return (
    <div className="shell">
      <aside className="sidebar"><SideNav /></aside>
      {open && (
        <>
          <div className="drawer-backdrop" onClick={() => setOpen(false)} />
          <div className="drawer" role="dialog" aria-label="Seller menu">
            <div className="row-between"><span className="fw-700">Menu</span><Button variant="ghost" iconOnly icon={X} size="sm" onClick={() => setOpen(false)} aria-label="Close menu" /></div>
            <SideNav onNavigate={() => setOpen(false)} />
          </div>
        </>
      )}
      <div className="shell-main">
        <div className="topbar">
          <Button variant="ghost" iconOnly icon={Menu} className="hide-lg" onClick={() => setOpen(true)} aria-label="Open menu" />
          <span className="fw-600 text-sm text-muted">Seller workspace</span>
          <div className="grow" />
          <Button variant="secondary" size="sm" to="/">View store</Button>
        </div>
        <div className="shell-content"><Outlet /></div>
      </div>
    </div>
  );
}
