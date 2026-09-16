import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { Store } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { useForm } from '../hooks/useForm';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { rules } from '../lib/validators';
import { FormField, Input, Textarea } from '../components/ui/FormField';
import { Button } from '../components/ui/Button';
import { Alert } from '../components/ui/Alert';

/** Seller Setup → role becomes `seller` → seller module unlocks. */
export default function SellerSetupPage() {
  useDocumentTitle('Become a seller');
  const { isSeller, sellerSetup } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const form = useForm({ storeName: '', description: '' }, rules.sellerSetup);
  const [error, setError] = useState(null);

  if (isSeller) return <Navigate to="/seller" replace />;

  const submit = async (e) => {
    e.preventDefault(); setError(null);
    if (!form.validateAll()) return;
    form.setSubmitting(true);
    try {
      await sellerSetup({ storeName: form.values.storeName.trim(), description: form.values.description.trim() || undefined });
      toast.success('Your store is ready', 'Add your first product to start selling.');
      navigate('/seller/products/new', { replace: true });
    } catch (err) {
      if (err.errors) form.applyServerErrors(err.errors); else setError(err.message);
    } finally { form.setSubmitting(false); }
  };

  return (
    <div className="auth">
      <form className="auth-card" onSubmit={submit} noValidate style={{ maxWidth: 480 }}>
        <div className="state-icon" style={{ background: 'var(--primary-tint)', color: 'var(--primary)' }}><Store size={22} /></div>
        <div><h1>Set up your store</h1><p className="lead">Choose a name buyers will see. You can list products, add photos and edit them any time.</p></div>
        {error && <Alert tone="danger">{error}</Alert>}
        <FormField label="Store name" required error={form.error('storeName')}>{(p) => <Input {...p} {...form.field('storeName')} placeholder="e.g. Northside Electronics" autoFocus />}</FormField>
        <FormField label="Short description" optional error={form.error('description')} hint={`${form.values.description.length}/300`}>
          {(p) => <Textarea {...p} {...form.field('description')} rows={3} placeholder="What do you sell?" />}
        </FormField>
        <Button type="submit" size="lg" block loading={form.submitting}>Create store</Button>
      </form>
    </div>
  );
}
