import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { Button } from './Button';

/** Accessible dialog: focus moves in, Escape/backdrop close, body scroll locked. */
export function Modal({ open, onClose, title, description, children, footer, size }) {
  const panelRef = useRef(null);
  const lastActive = useRef(null);

  useEffect(() => {
    if (!open) return;
    lastActive.current = document.activeElement;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const first = panelRef.current?.querySelector('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
    (first || panelRef.current)?.focus();
    const onKey = (e) => {
      if (e.key === 'Escape') onClose?.();
      if (e.key === 'Tab' && panelRef.current) {
        const f = [...panelRef.current.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')].filter((el) => !el.disabled);
        if (!f.length) return;
        const firstEl = f[0], lastEl = f[f.length - 1];
        if (e.shiftKey && document.activeElement === firstEl) { e.preventDefault(); lastEl.focus(); }
        else if (!e.shiftKey && document.activeElement === lastEl) { e.preventDefault(); firstEl.focus(); }
      }
    };
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = prev; lastActive.current?.focus?.(); };
  }, [open, onClose]);

  if (!open) return null;
  return createPortal(
    <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose?.(); }}>
      <div ref={panelRef} className="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title" tabIndex={-1} style={size === 'lg' ? { maxWidth: 720 } : undefined}>
        <div className="modal-head">
          <div>
            <h3 id="modal-title">{title}</h3>
            {description && <p className="text-muted text-sm" style={{ marginTop: 4 }}>{description}</p>}
          </div>
          <Button variant="ghost" size="sm" iconOnly icon={X} onClick={onClose} aria-label="Close" />
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}

/** Confirmation for destructive or irreversible actions. */
export function ConfirmDialog({ open, onCancel, onConfirm, title, children, confirmLabel = 'Confirm', danger = false, loading = false }) {
  return (
    <Modal open={open} onClose={loading ? undefined : onCancel} title={title}
      footer={<>
        <Button variant="secondary" onClick={onCancel} disabled={loading}>Cancel</Button>
        <Button variant={danger ? 'danger' : 'primary'} onClick={onConfirm} loading={loading}>{confirmLabel}</Button>
      </>}>
      {children}
    </Modal>
  );
}
