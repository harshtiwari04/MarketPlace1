import { Button } from '../ui/Button';
import { Input } from '../ui/FormField';

const PRESETS = [
  { label: '7d', days: 7 },
  { label: '30d', days: 30 },
  { label: '90d', days: 90 },
  { label: 'Year', days: 365 },
];

const iso = (d) => new Date(d).toISOString().slice(0, 10);

/** Date range shared by every analytics widget. Value: { from: 'YYYY-MM-DD', to: 'YYYY-MM-DD' }. */
export function RangePicker({ value, onChange }) {
  const pick = (days) => {
    const to = new Date();
    const from = new Date(to.getTime() - (days - 1) * 86_400_000);
    onChange({ from: iso(from), to: iso(to) });
  };
  const activeDays = PRESETS.find((p) => {
    const to = new Date(); const from = new Date(to.getTime() - (p.days - 1) * 86_400_000);
    return value.from === iso(from) && value.to === iso(to);
  })?.days;
  return (
    <div className="range-picker" role="group" aria-label="Date range">
      {PRESETS.map((p) => <Button key={p.days} size="sm" variant={activeDays === p.days ? 'primary' : 'secondary'} onClick={() => pick(p.days)}>{p.label}</Button>)}
      <Input type="date" aria-label="From" value={value.from} max={value.to} onChange={(e) => onChange({ ...value, from: e.target.value })} style={{ width: 150 }} />
      <span className="text-muted text-sm">to</span>
      <Input type="date" aria-label="To" value={value.to} min={value.from} onChange={(e) => onChange({ ...value, to: e.target.value })} style={{ width: 150 }} />
    </div>
  );
}

export const defaultRange = () => {
  const to = new Date();
  return { from: iso(new Date(to.getTime() - 29 * 86_400_000)), to: iso(to) };
};

/** Converts the picker value into API params — `to` is pushed to end-of-day so the last day is inclusive. */
export const rangeParams = ({ from, to }) => ({ from: from ? new Date(`${from}T00:00:00`).toISOString() : undefined, to: to ? new Date(`${to}T23:59:59.999`).toISOString() : undefined });
