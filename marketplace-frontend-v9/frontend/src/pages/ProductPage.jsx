import { useState } from 'react';
import { cloudinaryUrl, cloudinarySrcSet } from '../lib/image';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ChevronRight, ImageOff, ShoppingCart } from 'lucide-react';
import { catalog } from '../lib/endpoints';
import { titleCase } from '../lib/format';
import { useAsync } from '../hooks/useAsync';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { useCart } from '../context/CartContext';
import { useToast } from '../context/ToastContext';
import { Price } from '../components/storefront/ProductCard';
import { Button } from '../components/ui/Button';
import { QuantityStepper } from '../components/ui/QuantityStepper';
import { Skeleton } from '../components/ui/Skeleton';
import { ErrorState } from '../components/ui/States';
import { Badge } from '../components/ui/Badge';

export default function ProductPage() {
  const { slug } = useParams();
  const { data: product, loading, error, reload } = useAsync((signal) => catalog.detail(slug, { signal }), [slug]);
  useDocumentTitle(product?.title);
  const cart = useCart();
  const toast = useToast();
  const navigate = useNavigate();
  const [qty, setQty] = useState(1);
  const [active, setActive] = useState(0);

  if (error) return <ErrorState error={error} onRetry={error.status === 404 ? undefined : reload} />;

  if (loading || !product) {
    return (
      <div className="pd" aria-busy="true">
        <Skeleton h="auto" style={{ aspectRatio: '1' }} r={10} />
        <div className="stack"><Skeleton w="30%" h={14} /><Skeleton w="80%" h={30} /><Skeleton w="40%" h={28} /><Skeleton h={90} r={10} /><Skeleton h={80} /></div>
      </div>
    );
  }

  const images = product.images.filter((i) => i.url);
  const addToCart = () => { cart.add(product, qty); toast.success('Added to cart', `${qty} × ${product.title}`); };
  const buyNow = () => { cart.add(product, qty); navigate('/checkout'); };

  return (
    <>
      <nav className="breadcrumb" aria-label="Breadcrumb">
        <Link to="/products">Products</Link><ChevronRight size={14} />
        <Link to={`/products?category=${product.category}`}>{titleCase(product.category)}</Link><ChevronRight size={14} />
        <span className="truncate" style={{ maxWidth: 200 }} aria-current="page">{product.title}</span>
      </nav>
      <div className="pd">
        <div className="pd-gallery">
          <div className="pd-main">{images[active] ? <img src={cloudinaryUrl(images[active].url, { width: 1000 })} srcSet={cloudinarySrcSet(images[active].url, [480, 800, 1200])} sizes="(max-width: 900px) 100vw, 600px" alt={product.title} decoding="async" /> : <ImageOff size={40} aria-hidden="true" />}</div>
          {images.length > 1 && (
            <div className="pd-thumbs" role="group" aria-label="Product images">
              {images.map((img, i) => <button key={img.publicId || img.url} type="button" aria-pressed={i === active} onClick={() => setActive(i)} aria-label={`Image ${i + 1}`}><img src={cloudinaryUrl(img.url, { width: 160 })} alt="" loading="lazy" decoding="async" /></button>)}
            </div>
          )}
        </div>
        <div className="pd-info">
          <div className="stack-sm">
            <Badge>{titleCase(product.category)}</Badge>
            <h1>{product.title}</h1>
          </div>
          <div className="pd-price"><Price value={product.price} unit={product.unit} /></div>
          <div className="pd-buy">
            <QuantityStepper value={qty} onChange={setQty} />
            <Button icon={ShoppingCart} onClick={addToCart} className="grow">Add to cart</Button>
            <Button variant="secondary" onClick={buyNow}>Buy now</Button>
          </div>
          <div>
            <h3 style={{ fontSize: 'var(--fs-md)', marginBottom: 'var(--s-2)' }}>About this product</h3>
            <p className="pd-desc">{product.description || 'No description provided.'}</p>
          </div>
        </div>
      </div>
    </>
  );
}
