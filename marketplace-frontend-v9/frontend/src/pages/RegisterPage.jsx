import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useForm } from '../hooks/useForm';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { rules } from '../lib/validators';
import { FormField, Input } from '../components/ui/FormField';
import { Button } from '../components/ui/Button';
import { Alert } from '../components/ui/Alert';
import { GoogleSignInButton } from '../components/auth/GoogleSignInButton';

export default function RegisterPage() {
  useDocumentTitle('Create account');
  const { register, loginWithGoogle } = useAuth();
  const navigate = useNavigate();
  const form = useForm({ name: '', email: '', password: '' }, rules.register);
  const [error, setError] = useState(null);
  const [googleBusy, setGoogleBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault(); setError(null);
    if (!form.validateAll()) return;
    form.setSubmitting(true);
    try {
      const email = form.values.email.trim().toLowerCase();
      // 201 (new) and 200 (unverified placeholder refreshed) both mean "a code is on its way" — land
      // straight on the code box. `sent=1` tells the page not to request a second code.
      const { codeSent } = await register({ name: form.values.name.trim(), email, password: form.values.password });
      navigate(`/verify-email?email=${encodeURIComponent(email)}&${codeSent ? 'sent=1' : 'autoSend=1'}`, { replace: true });
    } catch (err) {
      if (err.status === 409 || err.code === 'EMAIL_IN_USE') {
        form.applyServerErrors({ email: 'An account with this email already exists. Sign in instead, or reset your password.' });
      } else if (err.errors) form.applyServerErrors(err.errors);
      else setError(err.message);
    } finally { form.setSubmitting(false); }
  };

  const handleGoogleCredential = async (idToken) => {
    setError(null); setGoogleBusy(true);
    try {
      const u = await loginWithGoogle(idToken); // Google sign-up creates the account and signs in, in one step.
      navigate(u.role === 'seller' ? '/seller' : '/', { replace: true });
    } catch (err) {
      setError(err.message || 'Google sign-up failed. Please try again.');
    } finally { setGoogleBusy(false); }
  };

  const pw = form.values.password;
  const strength = pw.length >= 12 ? 'Strong' : pw.length >= 8 ? 'Good' : pw.length ? 'Too short' : '';

  return (
    <div className="auth">
      <form className="auth-card" onSubmit={submit} noValidate>
        <div><h1>Create your account</h1><p className="lead">Buy faster next time, or set up a store to start selling.</p></div>
        {error && <Alert tone="danger">{error}</Alert>}
        <GoogleSignInButton onCredential={handleGoogleCredential} onError={(e) => setError(e.message)} text="signup_with" />
        {googleBusy && <p className="text-sm text-muted" style={{ textAlign: 'center' }}>Setting up your account…</p>}
        <div className="row" style={{ alignItems: 'center', gap: 'var(--s-3)' }} aria-hidden="true">
          <hr style={{ flex: 1, border: 0, borderTop: '1px solid var(--line)' }} />
          <span className="text-xs text-muted">or</span>
          <hr style={{ flex: 1, border: 0, borderTop: '1px solid var(--line)' }} />
        </div>
        <FormField label="Full name" required error={form.error('name')}>{(p) => <Input {...p} {...form.field('name')} autoComplete="name" autoFocus />}</FormField>
        <FormField label="Email" required error={form.error('email')}>{(p) => <Input {...p} {...form.field('email')} type="email" autoComplete="email" placeholder="you@example.com" />}</FormField>
        <FormField label="Password" required error={form.error('password')} hint={strength ? `Password strength: ${strength}` : 'At least 8 characters'}>
          {(p) => <Input {...p} {...form.field('password')} type="password" autoComplete="new-password" />}
        </FormField>
        <Button type="submit" size="lg" block loading={form.submitting}>Create account</Button>
        <p className="auth-alt">Already have an account? <Link to="/login">Sign in</Link></p>
      </form>
    </div>
  );
}
