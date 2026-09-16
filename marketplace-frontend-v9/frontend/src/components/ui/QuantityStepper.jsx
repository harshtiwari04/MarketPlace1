import { Minus, Plus } from 'lucide-react';

export function QuantityStepper({ value, onChange, min = 1, max = 99, size }) {
  return (
    <div className="qty" role="group" aria-label="Quantity">
      <button type="button" onClick={() => onChange(value - 1)} disabled={value <= min} aria-label="Decrease quantity"><Minus size={14} /></button>
      <output aria-live="polite" className="num">{value}</output>
      <button type="button" onClick={() => onChange(value + 1)} disabled={value >= max} aria-label="Increase quantity"><Plus size={14} /></button>
    </div>
  );
}
