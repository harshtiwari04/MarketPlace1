import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ImageOff, Pencil, PlusCircle, Package, MoreVertical, Copy, EyeOff, Eye,
  Trash2, Download, Plus, AlertTriangle,
} from 'lucide-react';
import { sellerProducts } from '../../lib/endpoints';
import { useAsync } from '../../hooks/useAsync';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { useMediaQuery } from '../../hooks/useMediaQuery';
import { useToast } from '../../context/ToastContext';
import { formatMoney, formatDate, titleCase } from '../../lib/format';
import { Button } from '../../components/ui/Button';
import { SearchBar } from '../../components/ui/SearchBar';
import { Select } from '../../components/ui/FormField';
import { EmptyState, ErrorState } from '../../components/ui/States';
import { TableSkeleton } from '../../components/ui/Skeleton';
import { Badge } from '../../components/ui/Badge';
import { Dropdown } from '../../components/ui/Dropdown';
import { ConfirmDialog, Modal } from '../../components/ui/Modal';
import { StatCard } from '../../components/ui/Card';
import { Pagination } from '../../components/ui/Pagination';

const STOCK_BADGE = {
  out_of_stock: { tone: 'danger', label: 'Out of stock' },
  low_stock: { tone: 'warning', label: 'Low stock' },
  in_stock: { tone: undefined, label: 'In stock' },
};

const SORT_OPTIONS = [
  ['newest', 'Newest first'],
  ['oldest', 'Oldest first'],
  ['title_asc', 'Title A–Z'],
  ['stock_asc', 'Stock: low to high'],
  ['stock_desc', 'Stock: high to low'],
  ['price_asc', 'Price: low to high'],
  ['price_desc', 'Price: high to low'],
];

const STATUS_OPTIONS = [
  ['', 'All statuses'],
  ['active', 'Active'],
  ['inactive', 'Hidden'],
  ['low_stock', 'Low stock'],
  ['out_of_stock', 'Out of stock'],
];

function StockBadge({ status }) {
  const cfg = STOCK_BADGE[status] || STOCK_BADGE.in_stock;
  return <Badge tone={cfg.tone}>{cfg.label}</Badge>;
}

/** Small popover-style modal for adjusting one or many products' stock at once. */
function StockEditModal({ open, onClose, count, singleCurrentStock, onSubmit, saving }) {
  const [mode, setMode] = useState('delta');
  const [value, setValue] = useState('');

  useEffect(() => {
    if (open) { setMode(count === 1 ? 'set' : 'delta'); setValue(count === 1 ? String(singleCurrentStock ?? '') : ''); }
  }, [open, count, singleCurrentStock]);

  const numericValue = Number(value);
  const valid = value !== '' && Number.isFinite(numericValue) && (mode === 'delta' || numericValue >= 0);

  return (
    <Modal
      open={open}
      onClose={saving ? undefined : onClose}
      title={count === 1 ? 'Update stock' : `Update stock for ${count} products`}
      footer={<>
        <Button variant="secondary" onClick={onClose} disabled={saving}>Cancel</Button>
        <Button onClick={() => onSubmit(mode, numericValue)} disabled={!valid} loading={saving}>Apply</Button>
      </>}
    >
      <div className="stack-sm">
        <div className="row" role="radiogroup" aria-label="Adjustment type" style={{ gap: 'var(--s-2)' }}>
          <Button type="button" size="sm" variant={mode === 'delta' ? 'primary' : 'secondary'} onClick={() => setMode('delta')}>Add / remove</Button>
          <Button type="button" size="sm" variant={mode === 'set' ? 'primary' : 'secondary'} onClick={() => setMode('set')}>Set exact amount</Button>
        </div>
        <label className="field-label" htmlFor="stock-value">
          {mode === 'delta' ? 'Amount to add (use a minus sign to remove, e.g. -5)' : 'New stock amount'}
        </label>
        <input
          id="stock-value"
          className="input"
          type="number"
          inputMode="numeric"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={mode === 'delta' ? 'e.g. 10 or -5' : 'e.g. 25'}
          autoFocus
        />
        {count === 1 && <p className="text-xs text-muted">Current stock: {singleCurrentStock}</p>}
      </div>
    </Modal>
  );
}

export default function ProductsPage() {
  useDocumentTitle('My products');
  const toast = useToast();
  const isMobile = useMediaQuery('(max-width: 767px)');

  const [q, setQ] = useState('');
  const [qDebounced, setQDebounced] = useState('');
  const [category, setCategory] = useState('');
  const [status, setStatus] = useState('');
  const [sort, setSort] = useState('newest');
  const [page, setPage] = useState(1);
  const limit = 60;

  useEffect(() => {
    const t = setTimeout(() => { setQDebounced(q); setPage(1); }, 350);
    return () => clearTimeout(t);
  }, [q]);

  const { data, loading, error, reload } = useAsync(
    (signal) => sellerProducts.list({ page, limit, includeInactive: true, q: qDebounced, sort }, { signal }),
    [page, qDebounced, sort],
  );
  const { data: summary, loading: summaryLoading, reload: reloadSummary } = useAsync((s) => sellerProducts.summary({ signal: s }), []);

  const [selected, setSelected] = useState(() => new Set());
  const [stockTarget, setStockTarget] = useState(null); // null | 'bulk' | product
  const [savingStock, setSavingStock] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [busyId, setBusyId] = useState(null);

  const list = useMemo(() => data?.items || [], [data]);
  const categories = useMemo(() => [...new Set(list.map((p) => p.category))].sort(), [list]);
  const filtered = useMemo(
    () => list.filter((p) => {
      if (category && p.category !== category) return false;
      if (status === 'active' && !p.isActive) return false;
      if (status === 'inactive' && p.isActive) return false;
      if (status === 'low_stock' && p.stockStatus !== 'low_stock') return false;
      if (status === 'out_of_stock' && p.stockStatus !== 'out_of_stock') return false;
      return true;
    }),
    [list, category, status],
  );

  const refreshAll = () => { reload(); reloadSummary(); };

  const toggleSelected = (id) => setSelected((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const allVisibleSelected = filtered.length > 0 && filtered.every((p) => selected.has(p.id));
  const toggleSelectAll = () => setSelected(allVisibleSelected ? new Set() : new Set(filtered.map((p) => p.id)));
  const clearSelection = () => setSelected(new Set());

  const handleToggleStatus = async (product) => {
    setBusyId(product.id);
    try {
      await sellerProducts.setActive(product.id, !product.isActive);
      toast.success(product.isActive ? 'Product hidden' : 'Product activated');
      refreshAll();
    } catch (err) {
      toast.error('Could not update product', err.message);
    } finally {
      setBusyId(null);
    }
  };

  const handleDuplicate = async (product) => {
    setBusyId(product.id);
    try {
      await sellerProducts.duplicate(product.id);
      toast.success('Product duplicated', 'Review it and set a stock amount before publishing.');
      refreshAll();
    } catch (err) {
      toast.error('Could not duplicate product', err.message);
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await sellerProducts.remove(deleteTarget.id);
      toast.success('Product deleted');
      setDeleteTarget(null);
      refreshAll();
    } catch (err) {
      toast.error('Could not delete product', err.message);
    } finally {
      setDeleting(false);
    }
  };

  const handleStockSubmit = async (mode, value) => {
    setSavingStock(true);
    try {
      if (stockTarget === 'bulk') {
        const ids = [...selected];
        const results = await sellerProducts.bulkUpdateStock(ids.map((id) => ({ id, mode, value })));
        const failed = results.filter((r) => !r.ok);
        if (failed.length) toast.error(`${failed.length} of ${ids.length} could not be updated`, failed[0]?.error);
        else toast.success(`Stock updated for ${ids.length} product(s)`);
        clearSelection();
      } else {
        await sellerProducts.updateStock(stockTarget.id, mode, value);
        toast.success('Stock updated');
      }
      setStockTarget(null);
      refreshAll();
    } catch (err) {
      toast.error('Could not update stock', err.message);
    } finally {
      setSavingStock(false);
    }
  };

  const handleExport = async () => {
    try {
      await sellerProducts.exportCsv();
    } catch (err) {
      toast.error('Could not export products', err.message);
    }
  };

  const Thumb = ({ p }) => <span className="seller-thumb">{p.images[0]?.url ? <img src={p.images[0].url} alt="" loading="lazy" /> : <ImageOff size={16} />}</span>;

  const actionsFor = (p) => [
    { label: 'Edit', icon: Pencil, to: `/seller/products/${p.id}/edit` },
    { label: 'Adjust stock', icon: Plus, onClick: () => setStockTarget(p) },
    { label: p.isActive ? 'Hide from buyers' : 'Activate', icon: p.isActive ? EyeOff : Eye, onClick: () => handleToggleStatus(p) },
    { label: 'Duplicate', icon: Copy, onClick: () => handleDuplicate(p) },
    { sep: true },
    { label: 'Delete permanently', icon: Trash2, danger: true, onClick: () => setDeleteTarget(p) },
  ];

  return (
    <>
      <div className="page-head">
        <div><h1 className="page-title">My products</h1>{!loading && !error && <p className="num">{data?.total ?? list.length} listed</p>}</div>
        <div className="row" style={{ gap: 'var(--s-2)' }}>
          <Button variant="secondary" icon={Download} onClick={handleExport}>Export CSV</Button>
          <Button to="/seller/products/new" icon={PlusCircle}>Add product</Button>
        </div>
      </div>

      <div className="stats-grid" style={{ marginBottom: 'var(--s-5)' }}>
        <StatCard label="Active products" value={summary?.activeProducts ?? '—'} loading={summaryLoading} />
        <StatCard label="Low stock" value={summary?.lowStockCount ?? '—'} loading={summaryLoading} note={summary?.lowStockCount ? 'Restock soon' : undefined} />
        <StatCard label="Out of stock" value={summary?.outOfStockCount ?? '—'} loading={summaryLoading} />
        <StatCard label="Lifetime revenue" value={summary ? formatMoney(summary.totalRevenue) : '—'} loading={summaryLoading} note={summary ? `${summary.totalSold} units sold` : undefined} />
      </div>

      {(list.length > 0 || qDebounced || category || status) && (
        <div className="catalog-toolbar">
          <SearchBar value={q} onChange={setQ} placeholder="Search your products" className="grow" />
          <Select value={category} onChange={(e) => setCategory(e.target.value)} aria-label="Filter by category" style={{ maxWidth: 200 }}>
            <option value="">All categories</option>
            {categories.map((c) => <option key={c} value={c}>{titleCase(c)}</option>)}
          </Select>
          <Select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Filter by status" style={{ maxWidth: 180 }}>
            {STATUS_OPTIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </Select>
          <Select value={sort} onChange={(e) => setSort(e.target.value)} aria-label="Sort" style={{ maxWidth: 200 }}>
            {SORT_OPTIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </Select>
        </div>
      )}

      {selected.size > 0 && (
        <div className="row-between" style={{ background: 'var(--surface-2)', border: '1px solid var(--line)', borderRadius: 'var(--r-md)', padding: 'var(--s-3) var(--s-4)', marginBottom: 'var(--s-4)' }}>
          <span className="text-sm fw-600">{selected.size} selected</span>
          <div className="row" style={{ gap: 'var(--s-2)' }}>
            <Button size="sm" variant="secondary" onClick={() => setStockTarget('bulk')}>Adjust stock</Button>
            <Button size="sm" variant="ghost" onClick={clearSelection}>Clear</Button>
          </div>
        </div>
      )}

      {error ? <ErrorState error={error} onRetry={reload} />
        : loading ? <TableSkeleton rows={6} />
        : list.length === 0 ? (
          <EmptyState icon={Package} title="No products yet" action={<Button to="/seller/products/new" icon={PlusCircle}>Add your first product</Button>}>Your listings will appear here once you add them.</EmptyState>
        ) : filtered.length === 0 ? (
          <EmptyState title="No matches" action={<Button variant="secondary" onClick={() => { setQ(''); setCategory(''); setStatus(''); }}>Clear filters</Button>}>Try another search, category, or status.</EmptyState>
        ) : isMobile ? (
          <div className="mobile-cards">
            {filtered.map((p) => (
              <div key={p.id} className="mobile-card" style={{ opacity: p.isActive ? 1 : 0.6 }}>
                <input type="checkbox" checked={selected.has(p.id)} onChange={() => toggleSelected(p.id)} aria-label={`Select ${p.title}`} />
                <Link to={`/seller/products/${p.id}/edit`} className="row" style={{ flex: 1, minWidth: 0, gap: 'var(--s-3)' }}>
                  <Thumb p={p} />
                  <div className="grow" style={{ minWidth: 0 }}>
                    <div className="fw-600 text-sm truncate">{p.title}</div>
                    <div className="text-xs text-muted">{titleCase(p.category)} · {p.stock} {p.unit} left</div>
                    <div style={{ marginTop: 4 }}><StockBadge status={p.stockStatus} />{!p.isActive && <Badge tone="warning" style={{ marginLeft: 4 }}>Hidden</Badge>}</div>
                  </div>
                  <div className="num fw-600 text-sm">{formatMoney(p.price)}</div>
                </Link>
                <Dropdown trigger={(p2) => <Button {...p2} variant="ghost" size="sm" iconOnly icon={MoreVertical} />} items={actionsFor(p)} />
              </div>
            ))}
          </div>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th><input type="checkbox" checked={allVisibleSelected} onChange={toggleSelectAll} aria-label="Select all" /></th>
                  <th>Product</th>
                  <th>Category</th>
                  <th className="td-num">Price</th>
                  <th className="td-num">Stock</th>
                  <th>Status</th>
                  <th className="td-num">Sold</th>
                  <th className="td-num">Revenue</th>
                  <th>Added</th>
                  <th><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((p) => (
                  <tr key={p.id} style={{ opacity: p.isActive ? 1 : 0.55 }}>
                    <td><input type="checkbox" checked={selected.has(p.id)} onChange={() => toggleSelected(p.id)} aria-label={`Select ${p.title}`} /></td>
                    <td><Link to={`/seller/products/${p.id}/edit`} className="seller-product-row" style={{ color: 'inherit', textDecoration: 'none' }}><Thumb p={p} /><span className="fw-600 truncate" style={{ maxWidth: 260 }}>{p.title}</span></Link></td>
                    <td>{titleCase(p.category)}</td>
                    <td className="td-num num">{formatMoney(p.price)}</td>
                    <td className="td-num">
                      <button type="button" className="num fw-600" style={{ background: 'none', border: 0, cursor: 'pointer', textDecoration: 'underline dotted' }} onClick={() => setStockTarget(p)} title="Click to adjust stock">
                        {p.stock} {p.unit}
                      </button>
                    </td>
                    <td className="row" style={{ gap: 4, flexWrap: 'wrap' }}>
                      <StockBadge status={p.stockStatus} />
                      {!p.isActive && <Badge tone="warning">Hidden</Badge>}
                    </td>
                    <td className="td-num num">{p.sold ?? 0}</td>
                    <td className="td-num num">{formatMoney(p.revenue ?? 0)}</td>
                    <td className="text-muted">{formatDate(p.createdAt)}</td>
                    <td className="td-actions">
                      <Dropdown trigger={(tp) => <Button {...tp} variant="ghost" size="sm" iconOnly icon={MoreVertical} loading={busyId === p.id} />} items={actionsFor(p)} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

      {data && !loading && !error && list.length > 0 && (
        <div style={{ marginTop: 'var(--s-4)' }}>
          <Pagination page={data.page} total={data.total} limit={data.limit} onChange={setPage} />
        </div>
      )}

      <StockEditModal
        open={stockTarget !== null}
        onClose={() => setStockTarget(null)}
        count={stockTarget === 'bulk' ? selected.size : 1}
        singleCurrentStock={stockTarget && stockTarget !== 'bulk' ? stockTarget.stock : undefined}
        onSubmit={handleStockSubmit}
        saving={savingStock}
      />

      <ConfirmDialog
        open={deleteTarget !== null}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="Delete this product?"
        confirmLabel="Delete permanently"
        danger
        loading={deleting}
      >
        <p><AlertTriangle size={16} style={{ verticalAlign: -2, marginRight: 6, color: 'var(--danger)' }} />This removes <strong>{deleteTarget?.title}</strong> and its photos for good. Past orders are not affected. If you just want to hide it temporarily, use "Hide from buyers" instead.</p>
      </ConfirmDialog>
    </>
  );
}
