import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { LayoutDashboard, Users, ClipboardList, Package, ArrowLeft, Menu, X, LogOut, ShieldCheck } from 'lucide-react';
import { APP_NAME } from '../../lib/config';
import { useAuth } from '../../context/AuthContext';
import { Button } from '../ui/Button';
import { initials } from '../../lib/format';

const links = [
  { to: '/admin', label: 'Overview', icon: LayoutDashboard, end: true },
  { to: '/admin/orders', label: 'Orders', icon: ClipboardList },
  { to: '/admin/products', label: 'Products', icon: Package },
  { to: '/admin/users', label: 'Users', icon: Users },
];

function SideNav({ onNavigate }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  return (
    <>
      <Link to="/admin" className="brand" onClick={onNavigate}><span className="brand-mark"><ShieldCheck size={16} /></span>{APP_NAME} admin</Link>
      <nav className="sidebar-nav" aria-label="Admin">
        {links.map((l) => (
          <NavLink key={l.to} to={l.to} end={l.end} className="side-link" onClick={onNavigate}><l.icon size={18} aria-hidden="true" />{l.label}</NavLink>
        ))}
      </nav>
      <div className="sidebar-foot">
        <div className="row" style={{ padding: 'var(--s-2) var(--s-3)' }}>
          <span className="avatar">{initials(user?.name)}</span>
          <div className="grow" style={{ minWidth: 0 }}>
            <div className="text-sm fw-600 truncate">{user?.name}</div>
            <div className="text-xs text-muted truncate">{user?.email}</div>
          </div>
        </div>
        <Link to="/" className="side-link" onClick={onNavigate}><ArrowLeft size={18} />Back to store</Link>
        <button type="button" className="side-link" style={{ border: 0, background: 'none', width: '100%' }} onClick={async () => { await logout(); navigate('/'); }}><LogOut size={18} />Sign out</button>
      </div>
    </>
  );
}

/** Same shell as the seller workspace so admins get an identical, familiar frame. */
export function AdminLayout() {
  const [open, setOpen] = useState(false);
  const location = useLocation();
  useEffect(() => setOpen(false), [location.pathname]);

  return (
    <div className="shell">
      <aside className="sidebar"><SideNav /></aside>
      {open && (
        <>
          <div className="drawer-backdrop" onClick={() => setOpen(false)} />
          <div className="drawer" role="dialog" aria-label="Admin menu">
            <div className="row-between"><span className="fw-700">Menu</span><Button variant="ghost" iconOnly icon={X} size="sm" onClick={() => setOpen(false)} aria-label="Close menu" /></div>
            <SideNav onNavigate={() => setOpen(false)} />
          </div>
        </>
      )}
      <div className="shell-main">
        <div className="topbar">
          <Button variant="ghost" iconOnly icon={Menu} className="hide-lg" onClick={() => setOpen(true)} aria-label="Open menu" />
          <span className="fw-600 text-sm text-muted">Admin panel</span>
          <div className="grow" />
          <Button variant="secondary" size="sm" to="/">View store</Button>
        </div>
        <div className="shell-content"><Outlet /></div>
      </div>
    </div>
  );
}
