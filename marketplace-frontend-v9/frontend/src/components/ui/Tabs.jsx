export function Tabs({ tabs, value, onChange }) {
  return (
    <div className="tabs" role="tablist">
      {tabs.map((t) => (
        <button key={t.value} type="button" role="tab" className="tab" aria-selected={value === t.value} onClick={() => onChange(t.value)}>
          {t.label}{t.count != null && <span className="text-muted"> {t.count}</span>}
        </button>
      ))}
    </div>
  );
}
