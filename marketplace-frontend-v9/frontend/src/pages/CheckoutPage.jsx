import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { MessageCircle, Pencil, ShieldCheck, CheckCircle2 } from 'lucide-react';
import { otp as otpApi, orders as ordersApi } from '../lib/endpoints';
import { rules, validate, normalizePhone } from '../lib/validators';
import { formatDuration, formatMinorUnits } from '../lib/format';
import { payWithRazorpay } from '../lib/razorpay';
import { useCart } from '../context/CartContext';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { useCountdown } from '../hooks/useCountdown';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { Steps } from '../components/ui/Steps';
import { FormField, Input } from '../components/ui/FormField';
import { Button } from '../components/ui/Button';
import { Alert } from '../components/ui/Alert';
import { OtpInput } from '../components/ui/OtpInput';
import { Badge } from '../components/ui/Badge';
import { Card } from '../components/ui/Card';
import { CartLines, OrderSummary } from './CartPage';

const STEPS = ['Contact', 'Delivery', 'Review & pay'];
const DRAFT_KEY = 'mk.checkout.draft.v1';
const DEFAULT_COOLDOWN_MS = 60_000;
const DEFAULT_TTL_MS = 5 * 60_000;

function loadDraft() {
  try { return JSON.parse(sessionStorage.getItem(DRAFT_KEY)) || {}; } catch { return {}; }
}

export default function CheckoutPage() {
  useDocumentTitle('Checkout');
  const cart = useCart();
  const { user } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();

  const draft = useMemo(loadDraft, []);
  const [step, setStep] = useState(0);
  const [contact, setContact] = useState(() => ({ name: user?.name || '', email: user?.email || '', phone: '', ...draft.contact }));
  const [address, setAddress] = useState(() => ({ line1: '', line2: '', city: '', state: '', postalCode: '', ...draft.address }));
  const [errors, setErrors] = useState({});

  // Phone verification — token lives in memory only for this checkout.
  const [verification, setVerification] = useState({ status: 'idle', token: null, phone: null, expiresAt: null, cooldownUntil: null, code: '', busy: false, error: null });
  const cooldown = useCountdown(verification.cooldownUntil);
  const ttl = useCountdown(verification.expiresAt);

  const [order, setOrder] = useState(null);       // { orderId, razorpayOrderId, amount, currency, keyId }
  const [placing, setPlacing] = useState(false);
  const [payState, setPayState] = useState({ status: 'idle', message: null }); // idle | paying | verifying | failed
  const [stepNotice, setStepNotice] = useState(null);

  useEffect(() => { sessionStorage.setItem(DRAFT_KEY, JSON.stringify({ contact, address })); }, [contact, address]);
  useEffect(() => { if (user) setContact((c) => ({ ...c, name: c.name || user.name, email: c.email || user.email })); }, [user]);
  useEffect(() => { if (cart.items.length === 0 && payState.status !== 'verifying') navigate('/cart', { replace: true }); }, [cart.items.length, navigate, payState.status]);

  const phoneNormalized = normalizePhone(contact.phone);
  const isVerified = verification.status === 'verified' && verification.phone === phoneNormalized;
  const codeExpired = verification.status === 'sent' && verification.expiresAt && ttl === 0;

  const setC = (e) => { const { name, value } = e.target; setContact((c) => ({ ...c, [name]: value })); setErrors((er) => ({ ...er, [name]: undefined })); };
  const setA = (e) => { const { name, value } = e.target; setAddress((a) => ({ ...a, [name]: value })); setErrors((er) => ({ ...er, [name]: undefined })); };

  /* ---- Guest OTP: send-whatsapp (rate-limited) ---- */
  const sendCode = async () => {
    const errs = validate(contact, rules.contact);
    if (Object.keys(errs).length) { setErrors(errs); return; }
    setVerification((v) => ({ ...v, busy: true, error: null }));
    try {
      const res = await otpApi.send(phoneNormalized);
      const now = Date.now();
      setVerification({ status: 'sent', token: null, phone: phoneNormalized, code: '', busy: false, error: null,
        expiresAt: now + Number(res?.expiresInMs || DEFAULT_TTL_MS), cooldownUntil: now + Number(res?.cooldownMs || DEFAULT_COOLDOWN_MS) });
    } catch (err) {
      if (err.status === 429) {
        // Cooldown not OK — wait it out.
        setVerification((v) => ({ ...v, busy: false, status: v.status === 'idle' ? 'sent' : v.status, phone: phoneNormalized,
          cooldownUntil: Date.now() + Number(err.retryAfterMs || DEFAULT_COOLDOWN_MS), error: 'A code was sent recently. You can request another when the timer ends.' }));
      } else {
        setVerification((v) => ({ ...v, busy: false, error: err.message }));
      }
    }
  };

  /* ---- verify-whatsapp → phoneVerificationToken ---- */
  const verifyCode = async (code) => {
    setVerification((v) => ({ ...v, busy: true, error: null }));
    try {
      const res = await otpApi.verify(phoneNormalized, code);
      const token = res?.phoneVerificationToken || res?.token;
      setVerification((v) => ({ ...v, status: 'verified', token, busy: false, code }));
      toast.success('Number verified');
      setStep(1);
    } catch (err) {
      const msg = err.status === 410 || err.code === 'OTP_EXPIRED' ? 'That code has expired. Request a new one.'
        : err.status === 400 || err.code === 'OTP_INVALID' ? 'That code is not correct. Check the message and try again.' : err.message;
      setVerification((v) => ({ ...v, busy: false, error: msg, code: '' }));
    }
  };

  const continueFromContact = () => {
    const errs = validate(contact, rules.contact);
    if (Object.keys(errs).length) { setErrors(errs); return; }
    if (!isVerified) { setVerification((v) => ({ ...v, error: 'Verify your WhatsApp number to continue.' })); return; }
    setStep(1);
  };
  const continueFromAddress = () => {
    const errs = validate(address, rules.address);
    if (Object.keys(errs).length) { setErrors(errs); return; }
    setStep(2);
  };

  /* ---- create-order → Razorpay Checkout → verify-payment ---- */
  const openPayment = async (o) => {
    setPayState({ status: 'paying', message: null });
    let rzp;
    try {
      rzp = await payWithRazorpay({ ...o, customer: { ...contact, phone: phoneNormalized } });
    } catch (err) {
      setPayState({ status: 'failed', message: err.dismissed ? 'Payment window was closed before completing. Your order is saved — you can try again.' : err.message });
      return;
    }
    setPayState({ status: 'verifying', message: null });
    try {
      const verified = await ordersApi.verifyPayment({
        razorpay_order_id: rzp.razorpay_order_id, razorpay_payment_id: rzp.razorpay_payment_id, razorpay_signature: rzp.razorpay_signature,
      });
      sessionStorage.removeItem(DRAFT_KEY);
      const orderId = verified?.orderId || o.orderId;
      cart.clear();
      navigate(`/checkout/success/${orderId}`, { replace: true, state: { orderId, amount: o.amount, currency: o.currency, paymentId: rzp.razorpay_payment_id, email: contact.email } });
    } catch (err) {
      setPayState({ status: 'failed', message: err.code === 'INVALID_SIGNATURE' || err.status === 400
        ? 'We could not confirm this payment. If money was taken, it will be refunded automatically by your bank within a few days. Reference: ' + (rzp.razorpay_payment_id || o.orderId)
        : err.message });
    }
  };

  const placeOrder = async () => {
    if (order) { openPayment(order); return; } // retry payment for the existing pending order
    setPlacing(true); setPayState({ status: 'idle', message: null });
    try {
      const payload = {
        items: cart.items.map((i) => ({ productId: i.productId || i.id, quantity: i.quantity })),
        shippingAddress: {
          street: address.line1 + (address.line2 ? `, ${address.line2}` : ''),
          city: address.city,
          state: address.state,
          postalCode: address.postalCode,
          country: 'IN',
        },
        email: contact.email.trim() || undefined,
        phoneVerificationToken: verification.token,
      };

      const res = await ordersApi.create(payload);
      
      const o = {
        orderId: res.orderId || res.id || res._id,
        razorpayOrderId: res.razorpayOrderId || res.razorpay_order_id,
        amount: res.amount, currency: res.currency || 'INR', keyId: res.keyId || res.key_id,
      };
      setOrder(o);
      setPlacing(false);
      await openPayment(o);
    } catch (err) {
      setPlacing(false);
      if (err.code === 'PHONE_VERIFICATION_REQUIRED' || err.code === 'PHONE_VERIFICATION_EXPIRED' || err.status === 403) {
        // requirePhoneVerification: no/expired token → back to Start Guest OTP, keep everything else.
        setVerification({ status: 'idle', token: null, phone: null, expiresAt: null, cooldownUntil: null, code: '', busy: false, error: null });
        setStepNotice('Your number needs to be verified again before we can create the order. Your details have been kept.');
        setStep(0);
      } else if (err.isValidation && err.errors) {
        setErrors(err.errors);
        const contactFields = ['name', 'email', 'phone'];
        setStep(Object.keys(err.errors).some((k) => contactFields.includes(k)) ? 0 : 1);
        setStepNotice('Please correct the highlighted fields.');
      } else {
        setPayState({ status: 'failed', message: err.message });
      }
    }
  };

  const goTo = (i) => { setStepNotice(null); setStep(i); };

  return (
    <>
      <div className="page-head">
        <div><h1 className="page-title">Checkout</h1><p>Three quick steps. Nothing is charged until you confirm payment.</p></div>
      </div>
      <div className="two-col">
        <div className="stack" style={{ gap: 'var(--s-5)' }}>
          <Steps steps={STEPS} current={step} />
          {stepNotice && <Alert tone="warning">{stepNotice}</Alert>}

          {/* ---------------- Step 1: Contact & phone ---------------- */}
          {step === 0 && (
            <section className="form-section" aria-labelledby="s1">
              <h3 id="s1">Contact details</h3>
              <p className="form-section-desc">We send a 6-digit code to your WhatsApp to confirm the number for delivery updates.</p>
              <div className="form-grid form-grid-2">
                <FormField label="Full name" required error={errors.name}>{(p) => <Input {...p} name="name" value={contact.name} onChange={setC} autoComplete="name" placeholder="Your name" />}</FormField>
                <FormField label="Email" optional error={errors.email} hint="For your receipt">{(p) => <Input {...p} name="email" type="email" value={contact.email} onChange={setC} autoComplete="email" placeholder="you@example.com" />}</FormField>
                <FormField label="WhatsApp number" required error={errors.phone} hint="Include the country code" className="span-2">
                  {(p) => (
                    <div className="row" style={{ alignItems: 'stretch' }}>
                      <Input {...p} name="phone" type="tel" inputMode="tel" value={contact.phone} onChange={(e) => { setC(e); }} autoComplete="tel" placeholder="+91 98765 43210" disabled={isVerified} />
                      {isVerified
                        ? <Button variant="secondary" icon={Pencil} onClick={() => setVerification({ status: 'idle', token: null, phone: null, expiresAt: null, cooldownUntil: null, code: '', busy: false, error: null })}>Change</Button>
                        : <Button variant={verification.status === 'sent' ? 'secondary' : 'primary'} icon={MessageCircle} onClick={sendCode} loading={verification.busy && verification.status !== 'sent'} disabled={cooldown > 0}>
                            {verification.status === 'sent' ? (cooldown > 0 ? `Resend in ${formatDuration(cooldown)}` : 'Resend code') : 'Send code'}
                          </Button>}
                    </div>
                  )}
                </FormField>
              </div>

              {isVerified && <Alert tone="success" title="Number verified"><span className="num">{verification.phone}</span> will receive order updates on WhatsApp.</Alert>}

              {verification.status === 'sent' && !isVerified && (
                <div className="stack-sm" style={{ padding: 'var(--s-4)', background: 'var(--canvas)', borderRadius: 'var(--r-md)' }}>
                  <div className="row-between wrap">
                    <span className="text-sm fw-600">Enter the code sent to <span className="num">{verification.phone}</span></span>
                    {verification.expiresAt && (codeExpired ? <Badge tone="danger">Code expired</Badge> : <Badge tone="info">Expires in {formatDuration(ttl)}</Badge>)}
                  </div>
                  <OtpInput value={verification.code} onChange={(code) => setVerification((v) => ({ ...v, code, error: null }))} onComplete={verifyCode} disabled={verification.busy || codeExpired} invalid={!!verification.error} />
                  {verification.busy && <span className="text-sm text-muted row"><span className="spinner" /> Checking code…</span>}
                </div>
              )}
              {verification.error && <Alert tone="danger">{verification.error}</Alert>}

              <div className="form-actions">
                <Button variant="ghost" to="/cart">Back to cart</Button>
                <Button onClick={continueFromContact} disabled={!isVerified}>Continue to delivery</Button>
              </div>
            </section>
          )}

          {/* ---------------- Step 2: Delivery ---------------- */}
          {step === 1 && (
            <section className="form-section" aria-labelledby="s2">
              <h3 id="s2">Delivery address</h3>
              <div className="form-grid form-grid-2">
                <FormField label="Address line 1" required error={errors.line1} className="span-2">{(p) => <Input {...p} name="line1" value={address.line1} onChange={setA} autoComplete="address-line1" placeholder="Flat, house, street" />}</FormField>
                <FormField label="Address line 2" optional className="span-2">{(p) => <Input {...p} name="line2" value={address.line2} onChange={setA} autoComplete="address-line2" placeholder="Landmark, area" />}</FormField>
                <FormField label="City" required error={errors.city}>{(p) => <Input {...p} name="city" value={address.city} onChange={setA} autoComplete="address-level2" />}</FormField>
                <FormField label="State" required error={errors.state}>{(p) => <Input {...p} name="state" value={address.state} onChange={setA} autoComplete="address-level1" />}</FormField>
                <FormField label="Postal code" required error={errors.postalCode}>{(p) => <Input {...p} name="postalCode" inputMode="numeric" value={address.postalCode} onChange={setA} autoComplete="postal-code" />}</FormField>
              </div>
              <div className="form-actions">
                <Button variant="ghost" onClick={() => goTo(0)}>Back</Button>
                <Button onClick={continueFromAddress}>Review order</Button>
              </div>
            </section>
          )}

          {/* ---------------- Step 3: Review & pay ---------------- */}
          {step === 2 && (
            <>
              <Card title="Items" padded={false}><div style={{ padding: '0 var(--s-5)' }}><CartLines items={cart.items} editable={!order} /></div></Card>
              <Card title="Delivering to" action={!order && <Button variant="ghost" size="sm" icon={Pencil} onClick={() => goTo(1)}>Edit</Button>}>
                <dl style={{ margin: 0 }}>
                  <div className="review-block"><dt>Name</dt><dd>{contact.name}</dd></div>
                  <div className="review-block"><dt>WhatsApp</dt><dd className="num row" style={{ justifyContent: 'flex-end', gap: 4 }}><CheckCircle2 size={14} style={{ color: 'var(--primary)' }} /> {phoneNormalized}</dd></div>
                  {contact.email && <div className="review-block"><dt>Email</dt><dd>{contact.email}</dd></div>}
                  <div className="review-block"><dt>Address</dt><dd>{[address.line1, address.line2, address.city, address.state, address.postalCode].filter(Boolean).join(', ')}</dd></div>
                </dl>
              </Card>
              {payState.status === 'failed' && (
                <Alert tone="danger" title="Payment not completed">{payState.message}</Alert>
              )}
              {order && payState.status !== 'failed' && payState.status !== 'idle' && (
                <Alert tone="info">{payState.status === 'verifying' ? 'Confirming your payment…' : 'Complete the payment in the Razorpay window.'}</Alert>
              )}
            </>
          )}
        </div>

        <aside>
          <OrderSummary items={cart.items} subtotal={cart.subtotal} serverAmount={order ? order.amount / 100 : null}>
            {step === 2 && (
              <div className="stack-sm">
                <Button block size="lg" icon={ShieldCheck} onClick={placeOrder} loading={placing || payState.status === 'paying' || payState.status === 'verifying'}>
                  {order ? `Retry payment · ${formatMinorUnits(order.amount)}` : 'Pay with Razorpay'}
                </Button>
                <p className="text-xs text-muted" style={{ textAlign: 'center' }}>Cards, UPI, net banking and wallets. Razorpay handles your payment details; we never see your card number.</p>
              </div>
            )}
            {step < 2 && <p className="text-xs text-muted">Payment opens after you review your order.</p>}
          </OrderSummary>
        </aside>
      </div>
    </>
  );
}
