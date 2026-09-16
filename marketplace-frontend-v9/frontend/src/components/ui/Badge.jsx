export function Badge({ tone, icon: Icon, children }) {
  return <span className={`badge ${tone ? `badge-${tone}` : ''}`}>{Icon && <Icon size={12} aria-hidden="true" />}{children}</span>;
}
