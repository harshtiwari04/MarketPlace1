import { useEffect, useState } from 'react';

/** Counts down to an absolute timestamp (ms). Returns remaining ms (0 when done). */
export function useCountdown(untilMs) {
  const [remaining, setRemaining] = useState(() => Math.max(0, (untilMs || 0) - Date.now()));
  useEffect(() => {
    if (!untilMs) { setRemaining(0); return; }
    const tick = () => setRemaining(Math.max(0, untilMs - Date.now()));
    tick();
    const id = setInterval(tick, 500);
    return () => clearInterval(id);
  }, [untilMs]);
  return remaining;
}
