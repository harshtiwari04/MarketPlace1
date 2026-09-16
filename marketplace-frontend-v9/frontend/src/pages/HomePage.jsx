import { Link } from 'react-router-dom';
import { ArrowRight, MessageCircle, ShieldCheck, Truck, ImageOff } from 'lucide-react';
import { catalog } from '../lib/endpoints';
import { useAsync } from '../hooks/useAsync';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { ProductCard } from '../components/storefront/ProductCard';
import { ProductCardSkeleton } from '../components/ui/Skeleton';
import { EmptyState, ErrorState } from '../components/ui/States';
import { Button } from '../components/ui/Button';
import { titleCase } from '../lib/format';

export default function HomePage() {
  useDocumentTitle('');
  const { data, loading, error, reload } = useAsync((signal) => catalog.list({ limit: 8, sort: 'newest' }, { signal }), []);
  const items = data?.items || [];
  const categories = [...new Set(items.map((p) => p.category))].slice(0, 6);
  const heroTiles = items.filter((p) => p.images?.[0]?.url).slice(0, 4);

  return (
    <>
      <section className="hero" aria-labelledby="hero-title">
        <div>
          <h1 id="hero-title">Everything from independent sellers, delivered to your door.</h1>
          <p>Browse the latest listings, pay securely with Razorpay, and check out as a guest with a quick WhatsApp code. No account needed.</p>
          <div className="hero-actions">
            <Button size="lg" to="/products">Browse products</Button>
            <Button size="lg" variant="secondary" to="/seller/setup">Sell on the marketplace</Button>
          </div>
        </div>
        <div className="hero-grid" aria-hidden="true">
          {(loading ? Array.from({ length: 4 }) : heroTiles.length ? heroTiles : Array.from({ length: 4 })).map((p, i) => (
            <div key={p?.id || i} className={`hero-tile ${loading ? 'skeleton' : ''}`}>
              {p?.images?.[0]?.url ? <img src={p.images[0].url} alt="" loading={i < 2 ? 'eager' : 'lazy'} /> : !loading && <div style={{ display: 'grid', placeItems: 'center', height: '100%', color: 'var(--muted-2)' }}><ImageOff size={24} /></div>}
            </div>
          ))}
        </div>
      </section>

      <section className="trust" aria-label="How it works">
        <div className="trust-item"><MessageCircle size={20} /><div><strong>Verify with WhatsApp</strong><span>A 6-digit code confirms your number at checkout. No password to remember.</span></div></div>
        <div className="trust-item"><ShieldCheck size={20} /><div><strong>Pay securely</strong><span>Cards, UPI and net banking through Razorpay. Every payment is verified before confirmation.</span></div></div>
        <div className="trust-item"><Truck size={20} /><div><strong>Direct from sellers</strong><span>Listings come straight from independent sellers who manage their own stock and photos.</span></div></div>
      </section>

      {categories.length > 0 && (
        <section className="section" aria-labelledby="cats">
          <div className="section-head"><h2 id="cats">Shop by category</h2></div>
          <div className="chips">
            {categories.map((c) => <Link key={c} to={`/products?category=${encodeURIComponent(c)}`} className="chip">{titleCase(c)}</Link>)}
          </div>
        </section>
      )}

      <section className="section" aria-labelledby="latest">
        <div className="section-head">
          <h2 id="latest">Latest listings</h2>
          <Link to="/products" className="text-sm fw-600" style={{ color: 'var(--primary)' }}>View all <ArrowRight size={14} style={{ verticalAlign: '-2px' }} /></Link>
        </div>
        {error ? <ErrorState error={error} onRetry={reload} />
          : loading ? <div className="product-grid">{Array.from({ length: 8 }).map((_, i) => <ProductCardSkeleton key={i} />)}</div>
          : items.length === 0 ? <EmptyState title="No products yet">Sellers have not listed anything yet. Be the first to add a product.</EmptyState>
          : <div className="product-grid">{items.map((p) => <ProductCard key={p.id} product={p} />)}</div>}
      </section>
    </>
  );
}
