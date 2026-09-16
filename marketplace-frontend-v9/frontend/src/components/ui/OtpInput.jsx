import { useRef } from 'react';
import { OTP_LENGTH } from '../../lib/config';

/** Six single-digit boxes with paste support; calls onComplete when full. */
export function OtpInput({ value, onChange, onComplete, disabled, invalid }) {
  const refs = useRef([]);
  const digits = Array.from({ length: OTP_LENGTH }, (_, i) => value[i] || '');

  const commit = (next) => {
    onChange(next);
    if (next.length === OTP_LENGTH) onComplete?.(next);
  };
  const handleChange = (i, raw) => {
    const clean = raw.replace(/\D/g, '');
    if (!clean) return;
    if (clean.length > 1) { // paste
      const next = (value.slice(0, i) + clean).slice(0, OTP_LENGTH);
      commit(next); refs.current[Math.min(OTP_LENGTH - 1, next.length)]?.focus(); return;
    }
    const arr = digits.slice(); arr[i] = clean;
    commit(arr.join('').slice(0, OTP_LENGTH));
    refs.current[i + 1]?.focus();
  };
  const handleKey = (i, e) => {
    if (e.key === 'Backspace') {
      e.preventDefault();
      const arr = digits.slice();
      if (arr[i]) { arr[i] = ''; onChange(arr.join('')); }
      else if (i > 0) { arr[i - 1] = ''; onChange(arr.join('')); refs.current[i - 1]?.focus(); }
    } else if (e.key === 'ArrowLeft') refs.current[i - 1]?.focus();
    else if (e.key === 'ArrowRight') refs.current[i + 1]?.focus();
  };

  return (
    <div className="otp" role="group" aria-label="6-digit verification code">
      {digits.map((d, i) => (
        <input key={i} ref={(el) => (refs.current[i] = el)} className="input" inputMode="numeric" autoComplete={i === 0 ? 'one-time-code' : 'off'} pattern="\d*"
          value={d} onChange={(e) => handleChange(i, e.target.value)} onKeyDown={(e) => handleKey(i, e)} onFocus={(e) => e.target.select()}
          disabled={disabled} aria-invalid={invalid || undefined} aria-label={`Digit ${i + 1}`} />
      ))}
    </div>
  );
}
