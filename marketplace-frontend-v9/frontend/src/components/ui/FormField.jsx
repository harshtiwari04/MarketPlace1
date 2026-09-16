import { useId } from 'react';
import { AlertCircle } from 'lucide-react';

/** Wraps a control with label, hint, and inline error, wiring aria attributes. */
export function FormField({ label, required, optional, hint, error, children, id: idProp, className = '' }) {
  const autoId = useId();
  const id = idProp || autoId;
  const hintId = hint ? `${id}-hint` : undefined;
  const errId = error ? `${id}-err` : undefined;
  const control = typeof children === 'function'
    ? children({ id, 'aria-describedby': [hintId, errId].filter(Boolean).join(' ') || undefined, 'aria-invalid': error ? 'true' : undefined, required })
    : children;
  return (
    <div className={`field ${className}`}>
      {label && (
        <label className="field-label" htmlFor={id}>
          {label}
          {required && <span className="field-required" aria-hidden="true">*</span>}
          {optional && <span className="field-optional">(optional)</span>}
        </label>
      )}
      {control}
      {hint && !error && <div id={hintId} className="field-hint">{hint}</div>}
      {error && <div id={errId} className="field-error" role="alert"><AlertCircle size={12} /> {error}</div>}
    </div>
  );
}

export function Input({ icon: Icon, suffix, className = '', ...props }) {
  if (!Icon && !suffix) return <input className={`input ${className}`} {...props} />;
  return (
    <div className="input-wrap">
      {Icon && <span className="input-icon"><Icon size={16} /></span>}
      <input className={`input ${suffix ? 'input-affix' : ''} ${className}`} {...props} />
      {suffix && <span className="input-suffix">{suffix}</span>}
    </div>
  );
}

export function Select({ className = '', children, ...props }) {
  return <select className={`select ${className}`} {...props}>{children}</select>;
}

export function Textarea({ className = '', ...props }) {
  return <textarea className={`textarea ${className}`} {...props} />;
}
