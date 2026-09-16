import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { SlidersHorizontal } from 'lucide-react';
import { catalog } from '../lib/endpoints';
import { CATEGORIES } from '../lib/config';
import { titleCase } from '../lib/format';
import { useAsync } from '../hooks/useAsync';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { ProductCard } from '../components/storefront/ProductCard';
import { ProductCardSkeleton } from '../components/ui/Skeleton';
import { EmptyState, ErrorState } from '../components/ui/States';
import { Pagination } from '../components/ui/Pagination';
import { Select, Input } from '../components/ui/FormField';
import { Button } from '../components/ui/Button';

const LIMIT = 12;
const SORTS = [['newest', 'Newest'], ['price_asc', 'Price: low to high'], ['price_desc', 'Price: high to low'], ['title_asc', 'Name A–Z']];

export default function CatalogPage() {
  useDocumentTitle('Products');
  const [params, setParams] = useSearchParams();
  const q = params.get('q') || '';
  const category = params.get('category') || '';
  const sort = params.get('sort') || 'newest';
  const page = Math.max(1, Number(params.get('page') || 1));
  const minPrice = params.get('minPrice') || '';
  const maxPrice = params.get('maxPrice') || '';
  const inStock = params.get('inStock') === 'true';

  // Price inputs are debounced into the URL so typing "1500" doesn't fire three requests.
  const [priceDraft, setPriceDraft] = useState({ min: minPrice, max: maxPrice });
  useEffect(() => { setPriceDraft({ min: minPrice, max: maxPrice }); }, [minPrice, maxPrice]);
  useEffect(() => {
    if (priceDraft.min === minPrice && priceDraft.max === maxPrice) return undefined;
    const t = setTimeout(() => update({ minPrice: priceDraft.min, maxPrice: priceDraft.max }), 450);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [priceDraft]);

  const update = (patch) => {
    const next = new URLSearchParams(params);
    Object.entries({ ...patch }).forEach(([k, v]) => (v ? next.set(k, v) : next.delete(k)));
    if (!('page' in patch)) next.delete('page');
    setParams(next);
  };

  const { data, loading, error, reload } = useAsync(
    (signal) => catalog.list({ q, category, sort, page, limit: LIMIT, minPrice, maxPrice, inStock: inStock ? 'true' : '' }, { signal }),
    [q, category, sort, page, minPrice, maxPrice, inStock],
  );

  // A4: if the backend returns a bare array we filter/sort/paginate client-side.
  const view = useMemo(() => {
    if (!data) return null;
    if (data.serverPaginated) return data;
    let items = data.items;
    if (q) { const s = q.toLowerCase(); items = items.filter((p) => p.title.toLowerCase().includes(s) || p.description.toLowerCase().includes(s)); }
    if (category) items = items.filter((p) => p.category === category);
    if (minPrice) items = items.filter((p) => p.effectivePrice >= Number(minPrice));
    if (maxPrice) items = items.filter((p) => p.effectivePrice <= Number(maxPrice));
    if (inStock) items = items.filter((p) => p.inStock);
    if (sort === 'price_asc') items = [...items].sort((a, b) => a.price - b.price);
    if (sort === 'price_desc') items = [...items].sort((a, b) => b.price - a.price);
    if (sort === 'newest') items = [...items].sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
    return { items: items.slice((page - 1) * LIMIT, page * LIMIT), total: items.length, page, limit: LIMIT };
  }, [data, q, category, sort, page, minPrice, maxPrice, inStock]);

  const hasFilters = q || category || minPrice || maxPrice || inStock;

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">{q ? `Results for “${q}”` : category ? titleCase(category) : 'All products'}</h1>
          {view && !loading && <p className="num">{view.total} {view.total === 1 ? 'product' : 'products'}</p>}
        </div>
      </div>

      <div className="catalog-toolbar">
        <div className="chips" role="group" aria-label="Filter by category">
          <button type="button" className="chip" aria-pressed={!category} onClick={() => update({ category: '' })}>All</button>
          {CATEGORIES.map((c) => (
            <button key={c} type="button" className="chip" aria-pressed={category === c} onClick={() => update({ category: c })}>{titleCase(c)}</button>
          ))}
        </div>
        <div className="catalog-controls">
          <SlidersHorizontal size={16} className="text-muted" aria-hidden="true" />
          <Select value={sort} onChange={(e) => update({ sort: e.target.value })} aria-label="Sort by">
            {SORTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </Select>
        </div>
      </div>
      <div className="catalog-toolbar" style={{ marginTop: 'var(--s-3)' }}>
        <div className="row wrap" style={{ gap: 'var(--s-2)' }} role="group" aria-label="Price range">
          <Input type="number" inputMode="numeric" min="0" placeholder="Min ₹" aria-label="Minimum price" value={priceDraft.min} onChange={(e) => setPriceDraft((d) => ({ ...d, min: e.target.value }))} style={{ width: 110 }} />
          <span className="text-muted" aria-hidden="true">–</span>
          <Input type="number" inputMode="numeric" min="0" placeholder="Max ₹" aria-label="Maximum price" value={priceDraft.max} onChange={(e) => setPriceDraft((d) => ({ ...d, max: e.target.value }))} style={{ width: 110 }} />
        </div>
        <label className="row text-sm" style={{ gap: 'var(--s-2)', cursor: 'pointer' }}>
          <input type="checkbox" checked={inStock} onChange={(e) => update({ inStock: e.target.checked ? 'true' : '' })} />
          In stock only
        </label>
        {hasFilters && <Button variant="ghost" size="sm" onClick={() => setParams({})}>Clear all</Button>}
      </div>

      {error ? <ErrorState error={error} onRetry={reload} />
        : loading ? <div className="product-grid">{Array.from({ length: 8 }).map((_, i) => <ProductCardSkeleton key={i} />)}</div>
        : view.items.length === 0 ? (
          <EmptyState title={hasFilters ? 'No matching products' : 'No products yet'}
            action={hasFilters && <Button variant="secondary" onClick={() => setParams({})}>Clear filters</Button>}>
            {hasFilters ? 'Try a different search term or category.' : 'Check back soon — sellers are adding listings.'}
          </EmptyState>
        ) : (
          <div className="stack" style={{ gap: 'var(--s-6)' }}>
            <div className="product-grid">{view.items.map((p) => <ProductCard key={p.id} product={p} />)}</div>
            <Pagination page={view.page} total={view.total} limit={view.limit} onChange={(p) => { update({ page: String(p) }); window.scrollTo({ top: 0 }); }} />
          </div>
        )}
    </>
  );
}
