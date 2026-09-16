import { useState } from 'react';
import { Link } from 'react-router-dom';
import { auth } from '../lib/endpoints';
import { useForm } from '../hooks/useForm';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { rules } from '../lib/validators';
import { FormField, Input } from '../components/ui/FormField';
import { Button } from '../components/ui/Button';
import { Alert } from '../components/ui/Alert';

export default function ForgotPasswordPage() {
  useDocumentTitle('Reset your password');
  const form = useForm({ email: '' }, rules.forgotPassword);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState(null);

  const submit = async (e) => {
    e.preventDefault(); setError(null);
    if (!form.validateAll()) return;
    form.setSubmitting(true);
    try {
      await auth.forgotPassword(form.values.email.trim());
      // Always show the same success state, whether or not the email has an account —
      // the backend responds identically either way to avoid leaking who's registered.
      setSent(true);
    } catch (err) {
      setError(err.message);
    } finally { form.setSubmitting(false); }
  };

  if (sent) {
    return (
      <div className="auth">
        <div className="auth-card">
          <h1>Check your email</h1>
          <p className="lead">If an account exists for <strong>{form.values.email.trim()}</strong>, we've sent a link to reset your password. It expires in 30 minutes.</p>
          <p className="auth-alt"><Link to="/login">Back to sign in</Link></p>
        </div>
      </div>
    );
  }

  return (
    <div className="auth">
      <form className="auth-card" onSubmit={submit} noValidate>
        <div><h1>Forgot your password?</h1><p className="lead">Enter your email and we'll send you a reset link.</p></div>
        {error && <Alert tone="danger">{error}</Alert>}
        <FormField label="Email" required error={form.error('email')}>
          {(p) => <Input {...p} {...form.field('email')} type="email" autoComplete="email" placeholder="you@example.com" autoFocus />}
        </FormField>
        <Button type="submit" size="lg" block loading={form.submitting}>Send reset link</Button>
        <p className="auth-alt"><Link to="/login">Back to sign in</Link></p>
      </form>
    </div>
  );
}
