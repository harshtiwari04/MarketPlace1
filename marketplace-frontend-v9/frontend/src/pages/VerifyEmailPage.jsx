import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { CheckCircle2, Mail } from 'lucide-react';
import { auth as authApi } from '../lib/endpoints';
import { useAuth } from '../context/AuthContext';
import { useCountdown } from '../hooks/useCountdown';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { isEmail } from '../lib/validators';
import { formatDuration } from '../lib/format';
import { FormField, Input } from '../components/ui/FormField';
import { Button } from '../components/ui/Button';
import { Alert } from '../components/ui/Alert';
import { Badge } from '../components/ui/Badge';
import { OtpInput } from '../components/ui/OtpInput';

const DEFAULT_TTL_MS = 10 * 60 * 1000;
const DEFAULT_COOLDOWN_MS = 60 * 1000;

/**
 * Same send → wait → 6-digit-box → verify pattern as the WhatsApp step in CheckoutPage, just
 * identified by email instead of phone. Reachable two ways: with ?email= prefilled (from the
 * account page banner, which also fires the first send), or blank (the user types their own
 * email and sends themselves a code).
 */
export default function VerifyEmailPage() {
  useDocumentTitle('Verify your email');
  const [params] = useSearchParams();
  const emailFromQuery = (params.get('email') || '').trim().toLowerCase();
  const autoSend = params.get('autoSend') === '1';
  // sent=1: the previous step (register / login-while-unverified) already emailed a code. Show the
  // code box immediately with the cooldown running instead of firing a second send request.
  const alreadySent = params.get('sent') === '1';
  const navigate = useNavigate();
  const { state: routeState } = useLocation();
  const { user, refresh } = useAuth();

  const [email, setEmail] = useState(emailFromQuery);
  const [emailError, setEmailError] = useState(null);
  const [verification, setVerification] = useState(() => {
    const now = Date.now();
    const preSent = alreadySent && !!emailFromQuery;
    return {
      status: preSent ? 'sent' : 'idle', // idle | sent | verified
      code: '',
      expiresAt: preSent ? now + DEFAULT_TTL_MS : null,
      cooldownUntil: preSent ? now + DEFAULT_COOLDOWN_MS : null,
      busy: false,
      error: null,
    };
  });
  const autoSentRef = useRef(false);
  const cooldown = useCountdown(verification.cooldownUntil);
  const ttl = useCountdown(verification.expiresAt);
  const codeExpired = verification.status === 'sent' && verification.expiresAt && ttl === 0;

  const sendCode = async (targetEmail) => {
    if (!isEmail(targetEmail)) { setEmailError('Enter a valid email address'); return; }
    setEmailError(null);
    setVerification((v) => ({ ...v, busy: true, error: null }));
    try {
      await authApi.sendVerificationCode(targetEmail);
      const now = Date.now();
      setVerification((v) => ({
        ...v, status: 'sent', code: '', busy: false, error: null,
        expiresAt: now + DEFAULT_TTL_MS, cooldownUntil: now + DEFAULT_COOLDOWN_MS,
      }));
    } catch (err) {
      if (err.status === 429) {
        setVerification((v) => ({
          ...v, busy: false, status: v.status === 'idle' ? 'sent' : v.status,
          cooldownUntil: Date.now() + Number(err.retryAfterMs || DEFAULT_COOLDOWN_MS),
          error: 'A code was sent recently. You can request another when the timer ends.',
        }));
      } else {
        setVerification((v) => ({ ...v, busy: false, error: err.message }));
      }
    }
  };

  // Fire the first send automatically when we arrive with a known email and an explicit
  // "sent" flag (e.g. from the account page banner), so the person lands straight on the
  // code box instead of having to press Send again.
  useEffect(() => {
    if (autoSend && !alreadySent && emailFromQuery && !autoSentRef.current) {
      autoSentRef.current = true;
      sendCode(emailFromQuery);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoSend, alreadySent, emailFromQuery]);

  const verifyCode = async (code) => {
    setVerification((v) => ({ ...v, busy: true, error: null }));
    try {
      await authApi.verifyEmailCode(email, code);
      setVerification((v) => ({ ...v, status: 'verified', busy: false, code }));
      if (user) refresh?.(); // pick up isEmailVerified: true if this browser has a session
    } catch (err) {
      setVerification((v) => ({ ...v, busy: false, error: err.message, code: '' }));
    }
  };

  const submitEmail = (e) => {
    e.preventDefault();
    sendCode(email);
  };

  return (
    <div className="auth">
      <div className="auth-card">
        {verification.status === 'verified' ? (
          <div style={{ textAlign: 'center' }}>
            <CheckCircle2 size={40} color="var(--success)" style={{ margin: '0 auto 12px' }} />
            <h1>Email verified</h1>
            <p className="lead">You're all set — {email} is now confirmed.</p>
            <Button size="lg" onClick={() => navigate(user ? '/account' : '/login', { replace: true, state: { returnTo: routeState?.returnTo, verified: true } })}>
              {user ? 'Back to account' : 'Continue to sign in'}
            </Button>
          </div>
        ) : (
          <>
            <div><h1>Verify your email</h1><p className="lead">Enter the 6-digit code we send to your inbox.</p></div>

            {verification.status !== 'sent' && (
              <form onSubmit={submitEmail} className="stack">
                <FormField label="Email" required error={emailError}>
                  {(p) => (
                    <Input {...p} type="email" value={email}
                      onChange={(e) => { setEmail(e.target.value); setEmailError(null); }}
                      autoComplete="email" autoFocus={!emailFromQuery} placeholder="you@example.com" />
                  )}
                </FormField>
                <Button type="submit" size="lg" block icon={Mail} loading={verification.busy}>Send code</Button>
              </form>
            )}

            {verification.status === 'sent' && (
              <div className="stack">
                <div className="row-between wrap">
                  <span className="text-sm fw-600">Enter the code sent to <span className="num">{email}</span></span>
                  {verification.expiresAt && (codeExpired
                    ? <Badge tone="danger">Code expired</Badge>
                    : <Badge tone="info">Expires in {formatDuration(ttl)}</Badge>)}
                </div>
                <OtpInput
                  value={verification.code}
                  onChange={(code) => setVerification((v) => ({ ...v, code, error: null }))}
                  onComplete={verifyCode}
                  disabled={verification.busy || codeExpired}
                  invalid={!!verification.error}
                />
                {verification.busy && <span className="text-sm text-muted row"><span className="spinner" /> Checking code…</span>}
                <Button variant="secondary" onClick={() => sendCode(email)} disabled={cooldown > 0} loading={verification.busy && cooldown === 0}>
                  {cooldown > 0 ? `Resend in ${formatDuration(cooldown)}` : 'Resend code'}
                </Button>
              </div>
            )}

            {verification.error && <Alert tone="danger">{verification.error}</Alert>}
            <p className="auth-alt">
              {user ? <>Wrong email? <Link to="/account">Back to account</Link></> : <>Already verified? <Link to="/login">Sign in</Link></>}
            </p>
          </>
        )}
      </div>
    </div>
  );
}
