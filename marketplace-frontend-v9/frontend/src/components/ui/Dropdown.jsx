import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';

/** Click-to-open menu. `items`: [{label, icon, to, onClick, danger, sep, head}] */
export function Dropdown({ trigger, items, align = 'right', label = 'Menu' }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e) => { if (!ref.current?.contains(e.target)) setOpen(false); };
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDoc); document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDoc); document.removeEventListener('keydown', onKey); };
  }, [open]);

  return (
    <div className="dropdown" ref={ref}>
      {trigger({ onClick: () => setOpen((o) => !o), 'aria-haspopup': 'menu', 'aria-expanded': open, 'aria-label': label })}
      {open && (
        <div className={`menu ${align === 'right' ? 'menu-right' : ''}`} role="menu">
          {items.map((it, i) => {
            if (it.sep) return <div key={i} className="menu-sep" role="separator" />;
            if (it.head) return <div key={i} className="menu-head">{it.head}</div>;
            const Icon = it.icon;
            const inner = <>{Icon && <Icon size={16} aria-hidden="true" />}{it.label}</>;
            const cls = `menu-item ${it.danger ? 'danger' : ''}`;
            if (it.to) return <Link key={i} to={it.to} className={cls} role="menuitem" onClick={() => setOpen(false)}>{inner}</Link>;
            return <button key={i} type="button" className={cls} role="menuitem" onClick={() => { setOpen(false); it.onClick?.(); }}>{inner}</button>;
          })}
        </div>
      )}
    </div>
  );
}
