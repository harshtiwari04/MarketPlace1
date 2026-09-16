import { RAZORPAY_KEY_ID, APP_NAME } from './config';

let loading;
/** Lazily loads Razorpay Checkout only when the user reaches the pay step. */
export function loadRazorpay() {
  if (window.Razorpay) return Promise.resolve(window.Razorpay);
  if (!loading) {
    loading = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'https://checkout.razorpay.com/v1/checkout.js';
      s.async = true;
      s.onload = () => resolve(window.Razorpay);
      s.onerror = () => { loading = null; reject(new Error('Payment service could not be loaded. Check your connection and try again.')); };
      document.body.appendChild(s);
    });
  }
  return loading;
}

/**
 * Opens Razorpay Checkout for an order created by `create-order`.
 * Resolves with `{ razorpay_order_id, razorpay_payment_id, razorpay_signature }` from Razorpay,
 * which the server verifies (HMAC) in `verify-payment`. The key SECRET never reaches this code.
 */
export async function payWithRazorpay({ razorpayOrderId, amount, currency, keyId, customer }) {
  const Razorpay = await loadRazorpay();
  const key = keyId || RAZORPAY_KEY_ID;
  if (!key) throw new Error('Payment is not configured (missing Razorpay key id).');

  return new Promise((resolve, reject) => {
    const rzp = new Razorpay({
      key,
      order_id: razorpayOrderId,
      amount,
      currency: currency || 'INR',
      name: APP_NAME,
      prefill: { name: customer?.name, email: customer?.email, contact: customer?.phone },
      theme: { color: '#1f6f4f' },
      handler: (response) => resolve(response),
      modal: { ondismiss: () => reject(Object.assign(new Error('Payment was not completed.'), { dismissed: true })) },
    });
    rzp.on('payment.failed', (r) => reject(new Error(r?.error?.description || 'Payment failed.')));
    rzp.open();
  });
}
