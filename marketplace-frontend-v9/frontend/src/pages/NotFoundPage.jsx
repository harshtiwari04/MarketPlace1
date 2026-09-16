import { SearchX, Lock } from 'lucide-react';
import { EmptyState } from '../components/ui/States';
import { Button } from '../components/ui/Button';
import { useDocumentTitle } from '../hooks/useDocumentTitle';

export default function NotFoundPage() {
  useDocumentTitle('Page not found');
  return (
    <div style={{ padding: 'var(--s-10) 0' }}>
      <EmptyState icon={SearchX} title="Page not found" action={<><Button to="/">Go home</Button><Button variant="secondary" to="/products">Browse products</Button></>}>
        The link may be out of date or mistyped.
      </EmptyState>
    </div>
  );
}

export function ForbiddenPage() {
  useDocumentTitle('Not allowed');
  return (
    <div style={{ padding: 'var(--s-10) 0' }}>
      <EmptyState icon={Lock} title="You do not have access to this" action={<><Button to="/seller/setup">Become a seller</Button><Button variant="secondary" to="/">Go home</Button></>}>
        This area is for sellers. Set up a store to unlock it.
      </EmptyState>
    </div>
  );
}
