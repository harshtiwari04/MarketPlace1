import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

// A6: the backend has no cart module; the cart is client state, persisted locally.
// Prices here are estimates — `create-order` recalculates the amount server-side.
const KEY = 'mk.cart.v1';
const CartContext = createContext(null);

function load() {
  try { return JSON.parse(localStorage.getItem(KEY)) || []; } catch { return []; }
}

export function CartProvider({ children }) {
  const [items, setItems] = useState(load);
  useEffect(() => { localStorage.setItem(KEY, JSON.stringify(items)); }, [items]);

  const add = useCallback((product, qty = 1) => {
    setItems((list) => {
      const i = list.findIndex((x) => x.productId === product.id);
      if (i >= 0) return list.map((x, idx) => (idx === i ? { ...x, quantity: Math.min(99, x.quantity + qty) } : x));
      return [...list, {
        productId: product.id, slug: product.slug || null, title: product.title, price: product.price, unit: product.unit,
        image: product.images?.[0]?.url || null, quantity: qty,
      }];
    });
  }, []);

  const setQuantity = useCallback((productId, quantity) => {
    setItems((list) => quantity <= 0 ? list.filter((x) => x.productId !== productId)
      : list.map((x) => (x.productId === productId ? { ...x, quantity: Math.min(99, quantity) } : x)));
  }, []);

  const remove = useCallback((productId) => setItems((l) => l.filter((x) => x.productId !== productId)), []);
  const clear = useCallback(() => setItems([]), []);

  const value = useMemo(() => {
    const count = items.reduce((n, x) => n + x.quantity, 0);
    const subtotal = items.reduce((n, x) => n + x.price * x.quantity, 0);
    return { items, count, subtotal, add, setQuantity, remove, clear };
  }, [items, add, setQuantity, remove, clear]);

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export const useCart = () => useContext(CartContext);
