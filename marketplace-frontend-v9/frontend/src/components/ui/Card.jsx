export function Card({ title, action, children, padded = true, className = '' }) {
  return (
    <section className={`card ${className}`}>
      {(title || action) && (
        <header className="card-head">
          {title && <h3>{title}</h3>}
          {action}
        </header>
      )}
      <div className={padded ? 'card-body' : ''}>{children}</div>
    </section>
  );
}

export function StatCard({ label, value, note, loading }) {
  return (
    <div className="stat">
      <span className="stat-label">{label}</span>
      {loading ? <span className="skeleton" style={{ height: 32, width: '50%' }} /> : <span className="stat-value num">{value}</span>}
      {note && <span className="stat-note">{note}</span>}
    </div>
  );
}
