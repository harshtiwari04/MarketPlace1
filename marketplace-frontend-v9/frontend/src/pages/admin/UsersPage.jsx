import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Users, ShieldCheck, ShieldOff, Search } from 'lucide-react';
import { admin } from '../../lib/endpoints';
import { useAsync } from '../../hooks/useAsync';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { useMediaQuery } from '../../hooks/useMediaQuery';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { formatDate } from '../../lib/format';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { Input, Select } from '../../components/ui/FormField';
import { Pagination } from '../../components/ui/Pagination';
import { EmptyState, ErrorState } from '../../components/ui/States';
import { TableSkeleton } from '../../components/ui/Skeleton';
import { ConfirmDialog, Modal } from '../../components/ui/Modal';

const ROLE_TONES = { admin: 'danger', seller: 'warning', buyer: 'info' };
export const RoleBadge = ({ role }) => <Badge tone={ROLE_TONES[role] || 'info'}>{role}</Badge>;

/** Change role / suspend. Sellers need a store name; the backend enforces the same rule. */
function EditUserDialog({ user, onClose, onSaved, selfId }) {
  const [role, setRole] = useState(user.role);
  const [storeName, setStoreName] = useState(user.storeName || '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const isSelf = user.id === selfId;
  const save = async () => {
    setBusy(true); setError(null);
    try {
      const body = {};
      if (role !== user.role) body.role = role;
      if (role === 'seller' && storeName && storeName !== user.storeName) body.storeName = storeName;
      if (!Object.keys(body).length) { onClose(); return; }
      onSaved(await admin.users.update(user.id, body));
      onClose();
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  };
  return (
    <Modal open onClose={onClose} title="Edit user" description={user.email}
      footer={<><Button variant="secondary" onClick={onClose} disabled={busy}>Cancel</Button><Button onClick={save} loading={busy}>Save</Button></>}>
      <div className="stack">
        {error && <p className="field-error" role="alert">{error}</p>}
        <label className="field"><span className="field-label">Role</span>
          <Select value={role} onChange={(e) => setRole(e.target.value)} disabled={isSelf}>
            <option value="buyer">Buyer</option><option value="seller">Seller</option><option value="admin">Admin</option>
          </Select>
          {isSelf && <span className="field-hint">You cannot change your own role.</span>}
        </label>
        {role === 'seller' && (
          <label className="field"><span className="field-label">Store name</span><Input value={storeName} onChange={(e) => setStoreName(e.target.value)} maxLength={100} placeholder="Required for sellers" /></label>
        )}
        <p className="text-xs text-muted">Changing a role signs the user out everywhere so the new permissions apply on their next request.</p>
      </div>
    </Modal>
  );
}

export default function AdminUsersPage() {
  useDocumentTitle('Admin · Users');
  const { user: me } = useAuth();
  const toast = useToast();
  const isMobile = useMediaQuery('(max-width: 767px)');
  const [params, setParams] = useSearchParams();
  const q = params.get('q') || '';
  const role = params.get('role') || '';
  const status = params.get('status') || ''; // '', suspended, unverified
  const page = Number(params.get('page') || 1);
  const [draft, setDraft] = useState(q);
  const [editing, setEditing] = useState(null);
  const [suspending, setSuspending] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const [local, setLocal] = useState({}); // id → updated user after PATCH

  const update = (patch) => { const next = new URLSearchParams(params); Object.entries(patch).forEach(([k, v]) => (v ? next.set(k, v) : next.delete(k))); if (!('page' in patch)) next.delete('page'); setParams(next); };
  const query = { q: q || undefined, role: role || undefined, suspended: status === 'suspended' ? 'true' : undefined, verified: status === 'unverified' ? 'false' : undefined, page, limit: 20 };
  const { data, loading, error, reload } = useAsync((s) => admin.users.list(query, { signal: s }), [q, role, status, page]);
  const list = (data?.items || []).map((u) => local[u.id] || u);

  const toggleSuspend = async (u) => {
    setBusyId(u.id);
    try {
      const updated = await admin.users.update(u.id, { isSuspended: !u.isSuspended });
      setLocal((l) => ({ ...l, [u.id]: updated }));
      toast.success(updated.isSuspended ? `${updated.email} suspended` : `${updated.email} reinstated`);
    } catch (err) { toast.error(err.message); } finally { setBusyId(null); setSuspending(null); }
  };

  const Actions = ({ u }) => (
    <div className="row" style={{ gap: 'var(--s-1)', justifyContent: 'flex-end' }}>
      <Button variant="ghost" size="sm" to={`/admin/users/${u.id}`}>Open</Button>
      <Button variant="ghost" size="sm" onClick={() => setEditing(u)}>Edit</Button>
      {u.id !== me?.id && (
        <Button variant={u.isSuspended ? 'secondary' : 'ghost'} size="sm" icon={u.isSuspended ? ShieldCheck : ShieldOff} loading={busyId === u.id}
          onClick={() => (u.isSuspended ? toggleSuspend(u) : setSuspending(u))}>{u.isSuspended ? 'Reinstate' : 'Suspend'}</Button>
      )}
    </div>
  );

  return (
    <>
      <div className="page-head"><div><h1 className="page-title">Users</h1><p>{data ? `${data.pagination.total} accounts` : 'All registered accounts.'}</p></div></div>
      <form className="catalog-toolbar" onSubmit={(e) => { e.preventDefault(); update({ q: draft }); }}>
        <Input icon={Search} value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Search name, email, phone, store" aria-label="Search users" />
        <div className="catalog-controls">
          <Select value={role} onChange={(e) => update({ role: e.target.value })} aria-label="Role"><option value="">Any role</option><option value="buyer">Buyers</option><option value="seller">Sellers</option><option value="admin">Admins</option></Select>
          <Select value={status} onChange={(e) => update({ status: e.target.value })} aria-label="Status"><option value="">Any status</option><option value="suspended">Suspended</option><option value="unverified">Unverified email</option></Select>
          <Button type="submit" variant="secondary">Search</Button>
        </div>
      </form>

      {error ? <ErrorState error={error} onRetry={reload} /> : loading ? <TableSkeleton rows={8} /> : list.length === 0 ? (
        <EmptyState icon={Users} title="No users match" action={<Button variant="secondary" onClick={() => { setDraft(''); setParams({}); }}>Clear filters</Button>} />
      ) : (
        <div className="stack" style={{ gap: 'var(--s-6)' }}>
          {isMobile ? (
            <div className="mobile-cards">{list.map((u) => (
              <div key={u.id} className="mobile-card" style={{ flexDirection: 'column', alignItems: 'stretch' }}>
                <div className="row-between"><Link to={`/admin/users/${u.id}`} className="fw-600 truncate">{u.name}</Link><RoleBadge role={u.role} /></div>
                <div className="text-xs text-muted truncate">{u.email}{u.isSuspended && ' · suspended'}{!u.isEmailVerified && ' · unverified'}</div>
                <div className="text-xs text-muted">Joined {formatDate(u.createdAt)} · last login {formatDate(u.lastLoginAt)}</div>
                <Actions u={u} />
              </div>
            ))}</div>
          ) : (
            <div className="table-wrap"><table className="table">
              <thead><tr><th>User</th><th>Role</th><th>Status</th><th>Joined</th><th>Last login</th><th className="td-num">Logins</th><th><span className="sr-only">Actions</span></th></tr></thead>
              <tbody>{list.map((u) => (
                <tr key={u.id} style={u.isSuspended ? { opacity: 0.6 } : undefined}>
                  <td><Link to={`/admin/users/${u.id}`} className="fw-600">{u.name}</Link><div className="text-xs text-muted">{u.email}{u.storeName && ` · ${u.storeName}`}</div></td>
                  <td><RoleBadge role={u.role} /></td>
                  <td className="text-sm">{u.isSuspended ? <Badge tone="danger">Suspended</Badge> : u.isEmailVerified ? <Badge tone="success">Verified</Badge> : <Badge tone="warning">Unverified</Badge>}{u.googleLinked && <span className="text-xs text-muted"> · Google</span>}</td>
                  <td className="text-muted">{formatDate(u.createdAt)}</td>
                  <td className="text-muted">{formatDate(u.lastLoginAt)}</td>
                  <td className="td-num num">{u.loginCount}</td>
                  <td className="td-actions"><Actions u={u} /></td>
                </tr>
              ))}</tbody>
            </table></div>
          )}
          <Pagination page={data.pagination.page} total={data.pagination.total} limit={data.pagination.limit} onChange={(p) => update({ page: String(p) })} />
        </div>
      )}

      {editing && <EditUserDialog user={editing} selfId={me?.id} onClose={() => setEditing(null)} onSaved={(u) => { setLocal((l) => ({ ...l, [u.id]: u })); toast.success('User updated'); }} />}
      <ConfirmDialog open={!!suspending} onCancel={() => setSuspending(null)} onConfirm={() => toggleSuspend(suspending)} title="Suspend this account?" confirmLabel="Suspend" danger loading={!!busyId}>
        {suspending?.email} will be signed out everywhere and blocked from signing in until reinstated. Their orders and listings are kept.
      </ConfirmDialog>
    </>
  );
}
