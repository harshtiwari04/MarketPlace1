import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Package, Search, ImageOff, Eye, EyeOff, Trash2 } from 'lucide-react';
import { admin } from '../../lib/endpoints';
import { useAsync } from '../../hooks/useAsync';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { useToast } from '../../context/ToastContext';
import { formatDate, formatMoney } from '../../lib/format';
import { CATEGORIES } from '../../lib/config';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { Input, Select } from '../../components/ui/FormField';
import { Pagination } from '../../components/ui/Pagination';
import { EmptyState, ErrorState } from '../../components/ui/States';
import { TableSkeleton } from '../../components/ui/Skeleton';
import { ConfirmDialog } from '../../components/ui/Modal';

/** Cross-seller product moderation: search, hide/unhide, permanently remove. */
export default function AdminProductsPage() {
  useDocumentTitle('Admin · Products');
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const q = params.get('q') || '';
  const category = params.get('category') || '';
  const sellerId = params.get('sellerId') || '';
  const includeInactive = params.get('includeInactive') === 'true';
  const page = Number(params.get('page') || 1);
  const [draft, setDraft] = useState(q);
  const [busyId, setBusyId] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [local, setLocal] = useState({}); // id → { hidden?: bool, removed?: bool }

  const update = (patch) => { const next = new URLSearchParams(params); Object.entries(patch).forEach(([k, v]) => (v ? next.set(k, v) : next.delete(k))); if (!('page' in patch)) next.delete('page'); setParams(next); };
  const query = { q: q || undefined, category: category || undefined, sellerId: sellerId || undefined, includeInactive: includeInactive ? 'true' : undefined, page, limit: 20 };
  const { data, loading, error, reload } = useAsync((s) => admin.products.list(query, { signal: s }), [q, category, sellerId, includeInactive, page]);
  const list = (data?.items || []).filter((p) => !local[p.id]?.removed).map((p) => (local[p.id]?.isActive === undefined ? p : { ...p, isActive: local[p.id].isActive }));

  const toggle = async (p) => {
    setBusyId(p.id);
    try { const u = await admin.products.setActive(p.id, !p.isActive); setLocal((l) => ({ ...l, [p.id]: { isActive: u.isActive } })); toast.success(u.isActive ? 'Product visible again' : 'Product hidden from the storefront'); }
    catch (err) { toast.error(err.message); } finally { setBusyId(null); }
  };
  const remove = async (p) => {
    setBusyId(p.id);
    try { await admin.products.remove(p.id); setLocal((l) => ({ ...l, [p.id]: { removed: true } })); toast.success('Product deleted'); }
    catch (err) { toast.error(err.message); } finally { setBusyId(null); setDeleting(null); }
  };

  return (
    <>
      <div className="page-head"><div><h1 className="page-title">Products</h1><p>{data ? `${data.total} listings` : 'All listings across sellers.'}</p></div></div>
      <form className="catalog-toolbar" onSubmit={(e) => { e.preventDefault(); update({ q: draft }); }}>
        <Input icon={Search} value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Search titles" aria-label="Search products" />
        <div className="catalog-controls">
          <Select value={category} onChange={(e) => update({ category: e.target.value })} aria-label="Category"><option value="">All categories</option>{CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}</Select>
          <label className="row text-sm" style={{ gap: 'var(--s-2)' }}><input type="checkbox" checked={includeInactive} onChange={(e) => update({ includeInactive: e.target.checked ? 'true' : '' })} /> Include hidden</label>
          <Button type="submit" variant="secondary">Search</Button>
        </div>
      </form>
      {sellerId && <p className="text-sm text-muted">Filtered to one seller. <button type="button" className="btn btn-ghost btn-sm" onClick={() => update({ sellerId: '' })}>Show all</button></p>}

      {error ? <ErrorState error={error} onRetry={reload} /> : loading ? <TableSkeleton rows={8} /> : list.length === 0 ? (
        <EmptyState icon={Package} title="No products match" action={<Button variant="secondary" onClick={() => { setDraft(''); setParams({}); }}>Clear filters</Button>} />
      ) : (
        <div className="stack" style={{ gap: 'var(--s-6)' }}>
          <div className="table-wrap"><table className="table">
            <thead><tr><th>Product</th><th>Seller</th><th>Category</th><th className="td-num">Price</th><th className="td-num">Stock</th><th>Status</th><th>Listed</th><th><span className="sr-only">Actions</span></th></tr></thead>
            <tbody>{list.map((p) => (
              <tr key={p.id} style={p.isActive ? undefined : { opacity: 0.6 }}>
                <td><div className="seller-product-row"><span className="seller-thumb">{p.images?.[0]?.url ? <img src={p.images[0].url} alt="" loading="lazy" /> : <ImageOff size={16} />}</span><div style={{ minWidth: 0 }}><Link to={p.slug ? `/products/${p.slug}` : '#'} className="fw-600 truncate" style={{ display: 'block', maxWidth: 260 }} target="_blank" rel="noreferrer">{p.title}</Link></div></div></td>
                <td className="text-sm">{p.seller ? <Link to={`/admin/users/${p.seller.id}`}>{p.seller.storeName || p.seller.name}</Link> : '—'}</td>
                <td className="text-muted" style={{ textTransform: 'capitalize' }}>{p.category}</td>
                <td className="td-num num">{formatMoney(p.effectivePrice)}{p.discountPrice != null && <div className="text-xs text-muted" style={{ textDecoration: 'line-through' }}>{formatMoney(p.price)}</div>}</td>
                <td className="td-num num">{p.stock}</td>
                <td>{p.isActive ? <Badge tone="success">Visible</Badge> : <Badge tone="warning">Hidden</Badge>}</td>
                <td className="text-muted">{formatDate(p.createdAt)}</td>
                <td className="td-actions"><div className="row" style={{ gap: 'var(--s-1)', justifyContent: 'flex-end' }}>
                  <Button variant="ghost" size="sm" icon={p.isActive ? EyeOff : Eye} loading={busyId === p.id} onClick={() => toggle(p)}>{p.isActive ? 'Hide' : 'Show'}</Button>
                  <Button variant="ghost" size="sm" icon={Trash2} onClick={() => setDeleting(p)} disabled={!!busyId}>Delete</Button>
                </div></td>
              </tr>
            ))}</tbody>
          </table></div>
          <Pagination page={data.page} total={data.total} limit={data.limit} onChange={(p) => update({ page: String(p) })} />
        </div>
      )}

      <ConfirmDialog open={!!deleting} onCancel={() => setDeleting(null)} onConfirm={() => remove(deleting)} title="Delete this product permanently?" confirmLabel="Delete" danger loading={!!busyId}>
        “{deleting?.title}” and its photos will be removed for good. Past orders keep their own copy of the title and price. Prefer <strong>Hide</strong> unless this is a policy violation.
      </ConfirmDialog>
    </>
  );
}
