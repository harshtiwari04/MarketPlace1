import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { sellerProducts } from '../../lib/endpoints';
import { CATEGORIES, UNITS } from '../../lib/config';
import { rules } from '../../lib/validators';
import { titleCase } from '../../lib/format';
import { useAsync } from '../../hooks/useAsync';
import { useForm } from '../../hooks/useForm';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { useToast } from '../../context/ToastContext';
import { FormField, Input, Select, Textarea } from '../../components/ui/FormField';
import { Button } from '../../components/ui/Button';
import { Alert } from '../../components/ui/Alert';
import { ConfirmDialog } from '../../components/ui/Modal';
import { ImageUploader } from '../../components/ui/ImageUploader';
import { ErrorState } from '../../components/ui/States';
import { Skeleton } from '../../components/ui/Skeleton';

const EMPTY = { title: '', description: '', price: '', stock: '', unit: 'pcs', category: 'electronics' };

/**
 * Create/Update Product → multipart form-data (title, description, price, unit, category, images)
 * plus removeImagePublicIds[] on edit. One component, two modes.
 */
export default function ProductFormPage() {
  const { id } = useParams();
  const isEdit = Boolean(id);
  useDocumentTitle(isEdit ? 'Edit product' : 'Add product');
  const navigate = useNavigate();
  const toast = useToast();

  const { data: product, loading, error, reload } = useAsync((s) => (isEdit ? sellerProducts.detail(id, { signal: s }) : Promise.resolve(null)), [id]);
  const form = useForm(EMPTY, rules.product);
  const [images, setImages] = useState({ files: [], removed: [] });
  const [customUnit, setCustomUnit] = useState(false);
  const [customCat, setCustomCat] = useState(false);
  const [serverError, setServerError] = useState(null);
  const [confirmLeave, setConfirmLeave] = useState(false);

  useEffect(() => {
    if (!product) return;
    form.setValues({ title: product.title, description: product.description, price: String(product.price), stock: String(product.stock ?? 0), unit: product.unit, category: product.category });
    setCustomUnit(!UNITS.includes(product.unit));
    setCustomCat(!CATEGORIES.includes(product.category));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [product]);

  const dirty = useMemo(() => {
    const base = product ? { title: product.title, description: product.description, price: String(product.price), stock: String(product.stock ?? 0), unit: product.unit, category: product.category } : EMPTY;
    return images.files.length > 0 || images.removed.length > 0 || Object.keys(base).some((k) => String(form.values[k] ?? '') !== String(base[k] ?? ''));
  }, [form.values, images, product]);

  useEffect(() => {
    if (!dirty) return;
    const h = (e) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', h);
    return () => window.removeEventListener('beforeunload', h);
  }, [dirty]);

  const imagesAfter = (product?.images.filter((i) => !images.removed.includes(i.publicId ?? i.url)).length || 0) + images.files.length;

  const submit = async (e) => {
    e.preventDefault(); setServerError(null);
    const ok = form.validateAll();
    if (!ok) { document.querySelector('[aria-invalid="true"]')?.focus(); return; }
    if (imagesAfter === 0) { setServerError('Add at least one photo so buyers can see the product.'); return; }

    const fd = new FormData();
    fd.append('title', form.values.title.trim());
    fd.append('description', form.values.description.trim());
    fd.append('price', String(Number(form.values.price)));
    fd.append('stock', String(Number(form.values.stock)));
    fd.append('unit', form.values.unit.trim());
    fd.append('category', form.values.category.trim().toLowerCase());
    images.files.forEach((f) => fd.append('images', f));
    images.removed.forEach((pid) => fd.append('removeImagePublicIds', pid)); // repeated key, no []: multer doesn't parse bracket notation

    form.setSubmitting(true);
    try {
      const saved = isEdit ? await sellerProducts.update(id, fd) : await sellerProducts.create(fd);
      toast.success(isEdit ? 'Product updated' : 'Product published', saved?.title);
      navigate('/seller/products', { replace: true });
    } catch (err) {
      if (err.errors) { form.applyServerErrors(err.errors); setServerError('Please correct the highlighted fields.'); }
      else if (err.status === 413) setServerError('The images are too large for the server. Try fewer or smaller files.');
      else setServerError(err.message);
      form.setSubmitting(false);
    }
  };

  const cancel = () => (dirty ? setConfirmLeave(true) : navigate(-1));

  if (isEdit && error) return <ErrorState error={error} onRetry={error.status === 404 ? undefined : reload} />;
  if (isEdit && (loading || !product)) {
    return <div className="stack" aria-busy="true"><Skeleton w="40%" h={28} /><Skeleton h={300} r={10} /><Skeleton h={200} r={10} /></div>;
  }

  return (
    <form onSubmit={submit} noValidate>
      <div className="page-head">
        <div><h1 className="page-title">{isEdit ? 'Edit product' : 'Add product'}</h1><p>{isEdit ? 'Changes go live as soon as you save.' : 'Fill in the details below. Buyers see this listing right after you publish.'}</p></div>
      </div>

      <div className="stack" style={{ gap: 'var(--s-5)', maxWidth: 820 }}>
        {serverError && <Alert tone="danger">{serverError}</Alert>}

        <section className="form-section" aria-labelledby="basics">
          <h3 id="basics">Basics</h3>
          <FormField label="Title" required error={form.error('title')} hint={`${form.values.title.length}/120`}>
            {(p) => <Input {...p} {...form.field('title')} maxLength={120} placeholder="e.g. Wireless noise-cancelling headphones" autoFocus={!isEdit} />}
          </FormField>
          <FormField label="Description" required error={form.error('description')} hint={`${form.values.description.length}/2000 · What it is, what is included, condition`}>
            {(p) => <Textarea {...p} {...form.field('description')} maxLength={2000} rows={6} />}
          </FormField>
        </section>

        <section className="form-section" aria-labelledby="pricing">
          <h3 id="pricing">Price & classification</h3>
          <div className="form-grid form-grid-2">
            <FormField label="Price" required error={form.error('price')}>
              {(p) => <Input {...p} {...form.field('price')} type="number" inputMode="decimal" min="0" step="0.01" placeholder="0.00" icon={() => <span style={{ fontWeight: 600 }}>₹</span>} />}
            </FormField>
            <FormField label="Stock" required error={form.error('stock')} hint="How many units are available right now">
              {(p) => <Input {...p} {...form.field('stock')} type="number" inputMode="numeric" min="0" step="1" placeholder="0" />}
            </FormField>
            <FormField label="Sold per" required error={form.error('unit')}>
              {(p) => customUnit
                ? <div className="row"><Input {...p} {...form.field('unit')} placeholder="e.g. pair" className="grow" /><Button variant="ghost" size="sm" onClick={() => { setCustomUnit(false); form.setValue('unit', 'pcs'); }}>List</Button></div>
                : <Select {...p} {...form.field('unit')} onChange={(e) => (e.target.value === '__custom' ? (setCustomUnit(true), form.setValue('unit', '')) : form.onChange(e))}>
                    {UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
                    <option value="__custom">Custom…</option>
                  </Select>}
            </FormField>
            <FormField label="Category" required error={form.error('category')} className="span-2">
              {(p) => customCat
                ? <div className="row"><Input {...p} {...form.field('category')} placeholder="e.g. garden" className="grow" /><Button variant="ghost" size="sm" onClick={() => { setCustomCat(false); form.setValue('category', 'electronics'); }}>List</Button></div>
                : <Select {...p} {...form.field('category')} onChange={(e) => (e.target.value === '__custom' ? (setCustomCat(true), form.setValue('category', '')) : form.onChange(e))}>
                    {CATEGORIES.map((c) => <option key={c} value={c}>{titleCase(c)}</option>)}
                    <option value="__custom">Custom…</option>
                  </Select>}
            </FormField>
          </div>
        </section>

        <section className="form-section" aria-labelledby="photos">
          <h3 id="photos">Photos</h3>
          <p className="form-section-desc">The first photo is the cover. {isEdit ? 'Remove a saved photo and it is deleted when you save.' : ''}</p>
          <ImageUploader existing={product?.images || []} removed={images.removed} files={images.files} onChange={setImages} />
        </section>

        <div className="form-actions">
          <Button variant="ghost" onClick={cancel} disabled={form.submitting}>Cancel</Button>
          <Button type="submit" loading={form.submitting} disabled={isEdit && !dirty}>
            {form.submitting ? (images.files.length ? 'Uploading photos…' : 'Saving…') : isEdit ? 'Save changes' : 'Publish product'}
          </Button>
        </div>
      </div>

      <ConfirmDialog open={confirmLeave} onCancel={() => setConfirmLeave(false)} onConfirm={() => navigate(-1)} title="Discard changes?" confirmLabel="Discard" danger>
        Your edits to this product have not been saved.
      </ConfirmDialog>
    </form>
  );
}
