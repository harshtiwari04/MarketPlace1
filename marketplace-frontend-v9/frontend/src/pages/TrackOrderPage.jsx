import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { PackageSearch, MessageCircle } from 'lucide-react';
import { orders, otp as otpApi } from '../lib/endpoints';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { useCountdown } from '../hooks/useCountdown';
import { useAuth } from '../context/AuthContext';
import { formatDuration, formatDate } from '../lib/format';
import { isPhone, normalizePhone } from '../lib/validators';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { Alert } from '../components/ui/Alert';
import { Badge } from '../components/ui/Badge';
import { FormField, Input } from '../components/ui/FormField';
import { OtpInput } from '../components/ui/OtpInput';
import { OrderView } from '../components/orders/OrderView';

const DEFAULT_TTL_MS = 5 * 60 * 1000;
const DEFAULT_COOLDOWN_MS = 60 * 1000;

/**
 * Guest order tracking. An order id alone never unlocks an order (they appear in WhatsApp
 * messages and screenshots) — the buyer must also re-verify the phone the order was placed with.
 * The verification token is kept in memory only, and is reusable for ~15 min so a guest can look
 * up several orders on the same number without re-verifying each time.
 */
export default function TrackOrderPage() {
  useDocumentTitle('Track order');
  const [params] = useSearchParams();
  const { isAuthenticated } = useAuth();

  const [orderId, setOrderId] = useState(params.get('orderId') || '');
  const [phone, setPhone] = useState('');
  const [errors, setErrors] = useState({});
  const [verification, setVerification] = useState({ status: 'idle', token: null, phone: null, expiresAt: null, cooldownUntil: null, code: '', busy: false, error: null });
  const [lookup, setLookup] = useState({ busy: false, error: null, order: null });

  const cooldown = useCountdown(verification.cooldownUntil);
  const ttl = useCountdown(verification.expiresAt);
  const phoneNormalized = normalizePhone(phone);
  const isVerified = verification.status === 'verified' && verification.phone === phoneNormalized;
  const codeExpired = verification.status === 'sent' && verification.expiresAt && ttl === 0;

  const validateForm = () => {
    const errs = {};
    if (!orderId.trim()) errs.orderId = 'Enter the order number from your confirmation message';
    if (!isPhone(phone)) errs.phone = 'Enter the WhatsApp number used at checkout, with country code (e.g. +91…)';
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const sendCode = async () => {
    if (!validateForm()) return;
    setVerification((v) => ({ ...v, busy: true, error: null }));
    try {
      const res = await otpApi.send(phoneNormalized);
      const now = Date.now();
      setVerification({ status: 'sent', token: null, phone: phoneNormalized, code: '', busy: false, error: null,
        expiresAt: now + Number(res?.expiresInMs || DEFAULT_TTL_MS), cooldownUntil: now + Number(res?.cooldownMs || DEFAULT_COOLDOWN_MS) });
    } catch (err) {
      if (err.status === 429) {
        setVerification((v) => ({ ...v, busy: false, status: v.status === 'idle' ? 'sent' : v.status, phone: phoneNormalized,
          cooldownUntil: Date.now() + Number(err.retryAfterMs || DEFAULT_COOLDOWN_MS), error: 'A code was sent recently. You can request another when the timer ends.' }));
      } else {
        setVerification((v) => ({ ...v, busy: false, error: err.message }));
      }
    }
  };

  const findOrder = async (token) => {
    setLookup({ busy: true, error: null, order: null });
    try {
      const order = await orders.track(orderId.trim(), token);
      setLookup({ busy: false, error: null, order });
    } catch (err) {
      const msg = err.status === 404
        ? 'No order matches that number and phone. Check the order number (it starts with ORD-) and that this is the number you checked out with.'
        : err.status === 403 ? 'Your verification expired. Request a new code.' : err.message;
      if (err.status === 403) setVerification((v) => ({ ...v, status: 'idle', token: null }));
      setLookup({ busy: false, error: msg, order: null });
    }
  };

  const verifyCode = async (code) => {
    setVerification((v) => ({ ...v, busy: true, error: null }));
    try {
      const res = await otpApi.verify(phoneNormalized, code);
      const token = res?.phoneVerificationToken || res?.token;
      setVerification((v) => ({ ...v, status: 'verified', token, busy: false, code }));
      await findOrder(token);
    } catch (err) {
      const msg = err.status === 410 || err.code === 'OTP_EXPIRED' ? 'That code has expired. Request a new one.'
        : err.status === 400 || err.code === 'OTP_INVALID' ? 'That code is not correct. Check the message and try again.' : err.message;
      setVerification((v) => ({ ...v, busy: false, error: msg, code: '' }));
    }
  };

  const onPrimary = () => (isVerified ? validateForm() && findOrder(verification.token) : sendCode());

  return (
    <>
      <div className="page-head">
        <div><h1 className="page-title">Track your order</h1><p className="text-muted">Enter your order number and confirm your WhatsApp number to see where it is.</p></div>
      </div>

      {isAuthenticated && !lookup.order && (
        <Alert tone="info" action={<Button size="sm" variant="secondary" to="/orders">My orders</Button>}>Signed in? Orders placed while logged in are already in your account.</Alert>
      )}

      <div className="two-col" style={{ marginTop: 'var(--s-4)', alignItems: 'start' }}>
        <Card>
          <div className="stack">
            <FormField label="Order number" required error={errors.orderId} hint="Looks like ORD-1725700000000-3F9A1C — it's in your WhatsApp confirmation.">
              <Input value={orderId} onChange={(e) => { setOrderId(e.target.value.toUpperCase()); setErrors((er) => ({ ...er, orderId: undefined })); }} placeholder="ORD-…" className="num" autoComplete="off" disabled={lookup.busy} />
            </FormField>
            <FormField label="WhatsApp number used at checkout" required error={errors.phone}>
              <Input type="tel" inputMode="tel" value={phone} onChange={(e) => { setPhone(e.target.value); setErrors((er) => ({ ...er, phone: undefined })); }} placeholder="+91 98765 43210" autoComplete="tel" disabled={verification.busy || lookup.busy} />
            </FormField>

            {isVerified && <Alert tone="success">Number verified. You can look up other orders on this number for a few minutes.</Alert>}

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
            {lookup.error && <Alert tone="danger">{lookup.error}</Alert>}

            <div className="form-actions">
              {verification.status === 'sent' && !isVerified && (
                <Button variant="ghost" onClick={sendCode} disabled={cooldown > 0 || verification.busy}>
                  {cooldown > 0 ? `Resend in ${formatDuration(cooldown)}` : 'Resend code'}
                </Button>
              )}
              <Button icon={isVerified ? PackageSearch : MessageCircle} loading={verification.busy || lookup.busy} onClick={onPrimary} disabled={verification.status === 'sent' && !isVerified && !codeExpired}>
                {isVerified ? 'Find order' : 'Send WhatsApp code'}
              </Button>
            </div>
          </div>
        </Card>

        <div>
          {lookup.order ? (
            <>
              <div className="row-between wrap">
                <div><div className="num fw-700">{lookup.order.orderId}</div><div className="text-sm text-muted">Placed {formatDate(lookup.order.createdAt)}</div></div>
              </div>
              <OrderView order={lookup.order} />
            </>
          ) : (
            <Card>
              <div className="stack-sm text-sm text-muted">
                <p style={{ margin: 0 }}><strong>Why verify again?</strong> Your order contains your delivery address. Confirming the number it was placed with keeps that private even if someone else sees your order number.</p>
                <p style={{ margin: 0 }}>Orders placed while signed in appear under <strong>Account → My orders</strong> without any of this.</p>
              </div>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
