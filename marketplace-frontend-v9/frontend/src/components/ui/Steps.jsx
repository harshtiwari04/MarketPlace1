import { Check } from 'lucide-react';

export function Steps({ steps, current }) {
  return (
    <ol className="steps" aria-label="Checkout progress" style={{ listStyle: 'none', padding: 0, margin: 0 }}>
      {steps.map((label, i) => {
        const state = i < current ? 'done' : i === current ? 'active' : '';
        return (
          <li key={label} className={`step ${state}`} aria-current={i === current ? 'step' : undefined}>
            <span className="step-dot" aria-hidden="true">{i < current ? <Check size={14} /> : i + 1}</span>
            <span className="step-label">{label}</span>
            {i < steps.length - 1 && <span className="step-line" aria-hidden="true" />}
          </li>
        );
      })}
    </ol>
  );
}
