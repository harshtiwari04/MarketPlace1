import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Eye, EyeOff } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { useForm } from '../hooks/useForm';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { rules } from '../lib/validators';
import { FormField, Input } from '../components/ui/FormField';
import { Button } from '../components/ui/Button';
import { Alert } from '../components/ui/Alert';
import { GoogleSignInButton } from '../components/auth/GoogleSignInButton';

export default function LoginPage() {
  useDocumentTitle('Sign in');
  const { login, loginWithGoogle } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const { state } = useLocation();
  const form = useForm({ email: '', password: '' }, rules.login);
  const [show, setShow] = useState(false);
  const [error, setError] = useState(null);
  const [googleBusy, setGoogleBusy] = useState(false);

  const goAfterAuth = (u) => navigate(state?.returnTo || (u.role === 'seller' ? '/seller' : '/'), { replace: true });

  const submit = async (e) => {
    e.preventDefault(); setError(null);
    if (!form.validateAll()) return;
    form.setSubmitting(true);
    try {
      const u = await login({ email: form.values.email.trim(), password: form.values.password });
      toast.success(`Welcome back, ${u.name.split(' ')[0]}`);
      goAfterAuth(u);
    } catch (err) {
      if (err.code === 'EMAIL_NOT_VERIFIED') {
        // Credentials were right but the address was never confirmed. The backend just (re)sent a
        // code, so go straight to the code box; keep returnTo so they land back here afterwards.
        const email = form.values.email.trim().toLowerCase();
        navigate(`/verify-email?email=${encodeURIComponent(email)}&sent=1`, { state: { returnTo: state?.returnTo } });
        return;
      }
      setError(err.status === 401 ? 'Email or password is incorrect.' : err.message);
      form.applyServerErrors(err.errors);
    } finally { form.setSubmitting(false); }
  };

  const handleGoogleCredential = async (idToken) => {
    setError(null); setGoogleBusy(true);
    try {
      const u = await loginWithGoogle(idToken);
      toast.success(`Welcome, ${u.name.split(' ')[0]}`);
      goAfterAuth(u);
    } catch (err) {
      setError(err.message || 'Google sign-in failed. Please try again.');
    } finally { setGoogleBusy(false); }
  };

  return (
    <div className="auth">
      <form className="auth-card" onSubmit={submit} noValidate>
        <div><h1>Sign in</h1><p className="lead">{state?.returnTo ? 'Sign in to continue where you left off.' : 'Welcome back.'}</p></div>
        {state?.registered && <Alert tone="success">Account created. Sign in to continue.</Alert>}
        {state?.verified && <Alert tone="success">Email verified. Sign in to continue.</Alert>}
        {error && <Alert tone="danger">{error}</Alert>}
        <GoogleSignInButton onCredential={handleGoogleCredential} onError={(e) => setError(e.message)} />
        {googleBusy && <p className="text-sm text-muted" style={{ textAlign: 'center' }}>Signing you in…</p>}
        <div className="row" style={{ alignItems: 'center', gap: 'var(--s-3)' }} aria-hidden="true">
          <hr style={{ flex: 1, border: 0, borderTop: '1px solid var(--line)' }} />
          <span className="text-xs text-muted">or</span>
          <hr style={{ flex: 1, border: 0, borderTop: '1px solid var(--line)' }} />
        </div>
        <FormField label="Email" required error={form.error('email')}>{(p) => <Input {...p} {...form.field('email')} type="email" autoComplete="email" placeholder="you@example.com" autoFocus />}</FormField>
        <FormField label="Password" required error={form.error('password')}>
          {(p) => (
            <div className="input-wrap" style={{ position: 'relative' }}>
              <input {...p} {...form.field('password')} className="input input-affix" style={{ paddingLeft: 12 }} type={show ? 'text' : 'password'} autoComplete="current-password" />
              <button type="button" className="input-suffix" style={{ background: 'none', border: 0, display: 'flex' }} onClick={() => setShow((s) => !s)} aria-label={show ? 'Hide password' : 'Show password'}>{show ? <EyeOff size={16} /> : <Eye size={16} />}</button>
            </div>
          )}
        </FormField>
        <p className="text-sm" style={{ marginTop: -8 }}><Link to="/forgot-password">Forgot your password?</Link></p>
        <Button type="submit" size="lg" block loading={form.submitting}>Sign in</Button>
        <p className="auth-alt">New here? <Link to="/register">Create an account</Link></p>
      </form>
    </div>
  );
}
