import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from './Button';

export function Pagination({ page, total, limit, onChange }) {
  const pages = Math.max(1, Math.ceil(total / limit));
  if (pages <= 1) return null;
  const from = (page - 1) * limit + 1, to = Math.min(total, page * limit);
  return (
    <nav className="pagination" aria-label="Pagination">
      <span className="num">Showing {from}–{to} of {total}</span>
      <div className="row">
        <Button variant="secondary" size="sm" icon={ChevronLeft} onClick={() => onChange(page - 1)} disabled={page <= 1}>Previous</Button>
        <span className="num">Page {page} of {pages}</span>
        <Button variant="secondary" size="sm" onClick={() => onChange(page + 1)} disabled={page >= pages}>Next <ChevronRight size={14} /></Button>
      </div>
    </nav>
  );
}
