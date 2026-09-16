import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { Skeleton } from '../ui/Skeleton';

function Loading() {
  return <div className="container" style={{ padding: 'var(--s-10) 0' }} aria-busy="true"><Skeleton h={28} w="30%" /><Skeleton h={160} style={{ marginTop: 16 }} r={10} /></div>;
}

/** verifyJWT equivalent on the client: needs a session. */
export function RequireAuth() {
  const { status } = useAuth();
  const location = useLocation();
  if (status === 'loading') return <Loading />;
  if (status === 'guest') return <Navigate to="/login" replace state={{ returnTo: location.pathname + location.search }} />;
  return <Outlet />;
}

/** requireSeller equivalent: role must be seller, otherwise go to Seller setup. */
export function RequireSeller() {
  const { status, isSeller } = useAuth();
  const location = useLocation();
  if (status === 'loading') return <Loading />;
  if (status === 'guest') return <Navigate to="/login" replace state={{ returnTo: location.pathname }} />;
  if (!isSeller) return <Navigate to="/seller/setup" replace />;
  return <Outlet />;
}

/** Sends signed-in users away from auth pages. */
export function GuestOnly() {
  const { status } = useAuth();
  if (status === 'loading') return <Loading />;
  if (status === 'authenticated') return <Navigate to="/" replace />;
  return <Outlet />;
}

/** requireAdmin equivalent: role must be admin. Non-admins get the 403 page rather than a redirect loop. */
export function RequireAdmin() {
  const { status, isAdmin } = useAuth();
  const location = useLocation();
  if (status === 'loading') return <Loading />;
  if (status === 'guest') return <Navigate to="/login" replace state={{ returnTo: location.pathname }} />;
  if (!isAdmin) return <Navigate to="/403" replace />;
  return <Outlet />;
}
