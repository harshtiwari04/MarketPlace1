import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { auth } from '../lib/endpoints';
import { useForm } from '../hooks/useForm';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { useToast } from '../context/ToastContext';
import { rules } from '../lib/validators';
import { FormField, Input } from '../components/ui/FormField';
import { Button } from '../components/ui/Button';
import { Alert } from '../components/ui/Alert';

export default function ResetPasswordPage() {
  useDocumentTitle('Set a new password');
  const [params] = useSearchParams();
  const token = params.get('token') || '';
  const navigate = useNavigate();
  const toast = useToast();
  const form = useForm({ password: '' }, rules.resetPassword);
  const [error, setError] = useState(null);

  if (!token) {
    return (
      <div className="auth">
        <div className="auth-card">
          <h1>Invalid link</h1>
          <p className="lead">This password reset link is missing its token. Please request a new one.</p>
          <p className="auth-alt"><Link to="/forgot-password">Request a new link</Link></p>
        </div>
      </div>
    );
  }

  const submit = async (e) => {
    e.preventDefault(); setError(null);
    if (!form.validateAll()) return;
    form.setSubmitting(true);
    try {
      await auth.resetPassword(token, form.values.password);
      toast.success('Password updated. Please sign in.');
      navigate('/login', { replace: true });
    } catch (err) {
      setError(err.message || 'This reset link is invalid or has expired.');
    } finally { form.setSubmitting(false); }
  };

  return (
    <div className="auth">
      <form className="auth-card" onSubmit={submit} noValidate>
        <div><h1>Set a new password</h1><p className="lead">Choose a strong password you haven't used before.</p></div>
        {error && (
          <Alert tone="danger">
            {error} <Link to="/forgot-password">Request a new link</Link>
          </Alert>
        )}
        <FormField label="New password" required error={form.error('password')} hint="At least 8 characters">
          {(p) => <Input {...p} {...form.field('password')} type="password" autoComplete="new-password" autoFocus />}
        </FormField>
        <Button type="submit" size="lg" block loading={form.submitting}>Update password</Button>
      </form>
    </div>
  );
}
