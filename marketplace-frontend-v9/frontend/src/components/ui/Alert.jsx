import { AlertCircle, CheckCircle2, Info, AlertTriangle } from 'lucide-react';
const ICONS = { info: Info, success: CheckCircle2, warning: AlertTriangle, danger: AlertCircle };

export function Alert({ tone = 'info', title, children, action }) {
  const Icon = ICONS[tone];
  return (
    <div className={`alert alert-${tone}`} role={tone === 'danger' ? 'alert' : 'status'}>
      <Icon size={18} aria-hidden="true" />
      <div className="grow">
        {title && <div className="alert-title">{title}</div>}
        {children && <div>{children}</div>}
      </div>
      {action}
    </div>
  );
}
