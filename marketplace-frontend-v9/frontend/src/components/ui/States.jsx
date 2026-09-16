import { PackageOpen, WifiOff, ServerCrash, SearchX, Lock } from 'lucide-react';
import { Button } from './Button';

export function EmptyState({ icon: Icon = PackageOpen, title, children, action }) {
  return (
    <div className="state">
      <div className="state-icon"><Icon size={22} aria-hidden="true" /></div>
      <h3>{title}</h3>
      {children && <p>{children}</p>}
      {action && <div className="state-actions">{action}</div>}
    </div>
  );
}

/** Maps an ApiError (or any error) to a clear explanation + next action. */
export function ErrorState({ error, onRetry, compact = false }) {
  let Icon = ServerCrash, title = 'Something went wrong', body = error?.message;
  if (error?.isNetwork) { Icon = WifiOff; title = 'You appear to be offline'; body = 'Check your connection, then try again.'; }
  else if (error?.status === 404) { Icon = SearchX; title = 'Not found'; body = 'This item may have been removed or the link is incorrect.'; }
  else if (error?.status === 403) { Icon = Lock; title = 'Not allowed'; body = 'Your account does not have access to this.'; }
  return (
    <div className="state" style={compact ? { padding: 'var(--s-6)' } : undefined} role="alert">
      <div className="state-icon danger"><Icon size={22} aria-hidden="true" /></div>
      <h3>{title}</h3>
      {body && <p>{body}</p>}
      {onRetry && <div className="state-actions"><Button variant="secondary" onClick={onRetry}>Try again</Button></div>}
    </div>
  );
}
