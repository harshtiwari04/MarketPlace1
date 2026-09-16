import { Link } from 'react-router-dom';
import { cloudinaryUrl, cloudinarySrcSet } from '../../lib/image';
import { ImageOff, Plus } from 'lucide-react';
import { formatMoney, titleCase } from '../../lib/format';
import { useCart } from '../../context/CartContext';
import { useToast } from '../../context/ToastContext';
import { Button } from '../ui/Button';

export function Price({ value, unit, className = '' }) {
  return (
    <span className={`price num ${className}`}>{formatMoney(value)}{unit && <span className="price-unit"> / {unit}</span>}</span>
  );
}

export function ProductCard({ product }) {
  const cart = useCart();
  const toast = useToast();
  const img = product.images?.[0]?.url;
  const add = (e) => { e.preventDefault(); cart.add(product, 1); toast.success('Added to cart', product.title); };
  return (
    <article className="product-card">
      <Link to={`/products/${product.slug}`} className="product-media" aria-label={product.title}>
        {img ? <img src={cloudinaryUrl(img, { width: 480 })} srcSet={cloudinarySrcSet(img)} sizes="(max-width: 600px) 50vw, (max-width: 1100px) 33vw, 300px" alt="" loading="lazy" decoding="async" /> : <ImageOff size={28} aria-hidden="true" />}
      </Link>
      <div className="product-body">
        <span className="product-cat">{titleCase(product.category)}</span>
        <Link to={`/products/${product.slug}`} className="product-title clamp-2">{product.title}</Link>
        <div className="product-price"><Price value={product.price} unit={product.unit} /></div>
      </div>
      <Button variant="secondary" size="sm" icon={Plus} onClick={add}>Add to cart</Button>
    </article>
  );
}
