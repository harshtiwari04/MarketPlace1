import { Link } from 'react-router-dom';
import { ImageOff, ShoppingCart, Trash2 } from 'lucide-react';
import { useCart } from '../context/CartContext';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { formatMoney } from '../lib/format';
import { Button } from '../components/ui/Button';
import { QuantityStepper } from '../components/ui/QuantityStepper';
import { EmptyState } from '../components/ui/States';
import { Card } from '../components/ui/Card';

export function CartLines({ items, editable = true }) {
  const cart = useCart();
  return (
    <div>
      {items.map((it) => {
        const href = it.slug ? `/products/${it.slug}` : '/products';
        return (
        <div key={it.productId} className="cart-line">
          <Link to={href} className="cart-thumb" aria-label={it.title}>
            {it.image ? <img src={it.image} alt="" loading="lazy" /> : <div style={{ display: 'grid', placeItems: 'center', height: '100%', color: 'var(--muted-2)' }}><ImageOff size={18} /></div>}
          </Link>
          <div className="cart-line-body">
            <div className="row-between" style={{ alignItems: 'flex-start' }}>
              <Link to={href} className="fw-600 clamp-2">{it.title}</Link>
              <span className="fw-700 num">{formatMoney(it.price * it.quantity)}</span>
            </div>
            <span className="text-sm text-muted num">{formatMoney(it.price)} / {it.unit}</span>
            {editable && (
              <div className="cart-line-foot">
                <QuantityStepper value={it.quantity} onChange={(q) => cart.setQuantity(it.productId, q)} />
                <Button variant="ghost" size="sm" icon={Trash2} onClick={() => cart.remove(it.productId)}>Remove</Button>
              </div>
            )}
            {!editable && <span className="text-sm text-muted num">Qty {it.quantity}</span>}
          </div>
        </div>
        );
      })}
    </div>
  );
}

export function OrderSummary({ items, subtotal, serverAmount, children }) {
  return (
    <Card title="Order summary">
      <div className="stack-sm">
        <div className="summary-row"><span>Items ({items.reduce((n, i) => n + i.quantity, 0)})</span><span className="num">{formatMoney(subtotal)}</span></div>
        <div className="summary-row"><span>Delivery</span><span>Calculated at payment</span></div>
        <div className="summary-total"><span>{serverAmount != null ? 'Total' : 'Estimated total'}</span><span className="num">{formatMoney(serverAmount ?? subtotal)}</span></div>
        {serverAmount == null && <p className="text-xs text-muted">Final amount is confirmed when your order is created.</p>}
      </div>
      {children && <div style={{ marginTop: 'var(--s-4)' }}>{children}</div>}
    </Card>
  );
}

export default function CartPage() {
  useDocumentTitle('Cart');
  const cart = useCart();

  if (cart.items.length === 0) {
    return (
      <>
        <div className="page-head"><h1 className="page-title">Your cart</h1></div>
        <EmptyState icon={ShoppingCart} title="Your cart is empty" action={<Button to="/products">Browse products</Button>}>
          Items you add will show up here and stay saved on this device.
        </EmptyState>
      </>
    );
  }

  return (
    <>
      <div className="page-head"><h1 className="page-title">Your cart</h1></div>
      <div className="two-col">
        <Card padded={false}><div style={{ padding: '0 var(--s-5)' }}><CartLines items={cart.items} /></div></Card>
        <aside>
          <OrderSummary items={cart.items} subtotal={cart.subtotal}>
            <Button block size="lg" to="/checkout">Continue to checkout</Button>
            <p className="text-xs text-muted" style={{ textAlign: 'center', marginTop: 'var(--s-3)' }}>You will confirm your WhatsApp number before paying.</p>
          </OrderSummary>
        </aside>
      </div>
    </>
  );
}
