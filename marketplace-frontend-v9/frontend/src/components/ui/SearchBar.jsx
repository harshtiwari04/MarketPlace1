import { Search, X } from 'lucide-react';

export function SearchBar({ value, onChange, onSubmit, placeholder = 'Search products', className = '' }) {
  return (
    <form role="search" className={`input-wrap ${className}`} onSubmit={(e) => { e.preventDefault(); onSubmit?.(value); }}>
      <span className="input-icon"><Search size={16} /></span>
      <input className="input input-affix" type="search" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} aria-label={placeholder} style={{ minHeight: 40 }} />
      {value && <button type="button" className="input-suffix" onClick={() => { onChange(''); onSubmit?.(''); }} aria-label="Clear search" style={{ background: 'none', border: 0, display: 'flex' }}><X size={16} /></button>}
    </form>
  );
}
