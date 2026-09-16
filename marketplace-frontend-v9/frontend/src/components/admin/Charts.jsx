import { formatMoney } from '../../lib/format';

/** Horizontal bars — one per category — sized relative to the largest. */
export function CategoryBars({ rows, total }) {
  if (!rows?.length) return <p className="text-sm text-muted">No paid orders in this period.</p>;
  const max = Math.max(...rows.map((r) => r.revenue), 1);
  return (
    <ul className="bars" aria-label="Revenue by category">
      {rows.map((r) => (
        <li key={r.category} className="bar-row">
          <span className="bar-label" title={r.category}>{r.category}</span>
          <div className="bar-track" role="img" aria-label={`${r.category}: ${formatMoney(r.revenue)}, ${Math.round(r.share * 100)}% of total`}>
            <div className="bar-fill" style={{ width: `${(r.revenue / max) * 100}%` }} />
          </div>
          <span className="bar-value num">
            <span className="fw-600">{formatMoney(r.revenue)}</span>
            <span className="text-muted"> · {total ? Math.round(r.share * 100) : 0}%</span>
          </span>
        </li>
      ))}
    </ul>
  );
}

const shortDate = (p) => (p.length === 7 ? new Date(`${p}-01`).toLocaleDateString('en-IN', { month: 'short', year: '2-digit' }) : new Date(p).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }));

/** Column chart of revenue per period. Pure CSS, no chart library — keeps the admin bundle small. */
export function RevenueSpark({ points }) {
  if (!points?.length) return <p className="text-sm text-muted">No revenue recorded in this period.</p>;
  const max = Math.max(...points.map((p) => p.revenue), 1);
  return (
    <div>
      <div className="spark" role="img" aria-label={`Revenue over ${points.length} periods`}>
        {points.map((p) => (
          <div key={p.period} className="spark-col" title={`${shortDate(p.period)}: ${formatMoney(p.revenue)} · ${p.orders} order${p.orders === 1 ? '' : 's'}`}>
            <div className="spark-bar" style={{ height: `${Math.max((p.revenue / max) * 100, 2)}%` }} />
          </div>
        ))}
      </div>
      <div className="spark-axis"><span>{shortDate(points[0].period)}</span>{points.length > 1 && <span>{shortDate(points[points.length - 1].period)}</span>}</div>
    </div>
  );
}
