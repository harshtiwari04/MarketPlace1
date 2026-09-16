export function Skeleton({ w = '100%', h = 16, r, style, className = '' }) {
  return <span className={`skeleton ${className}`} aria-hidden="true" style={{ display: 'block', width: w, height: h, borderRadius: r, ...style }} />;
}

export function ProductCardSkeleton() {
  return (
    <div className="product-card" aria-hidden="true">
      <div className="product-media skeleton" style={{ borderRadius: 0 }} />
      <div className="product-body">
        <Skeleton w="40%" h={12} />
        <Skeleton w="85%" h={14} />
        <Skeleton w="60%" h={14} />
        <div className="product-price"><Skeleton w="35%" h={18} /></div>
      </div>
    </div>
  );
}

export function TableSkeleton({ rows = 5 }) {
  return (
    <div className="stack-sm" aria-busy="true" aria-label="Loading">
      {Array.from({ length: rows }).map((_, i) => <Skeleton key={i} h={52} r={8} />)}
    </div>
  );
}
