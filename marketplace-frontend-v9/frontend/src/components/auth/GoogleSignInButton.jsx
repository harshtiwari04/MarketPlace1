import { useEffect, useId, useRef, useState } from 'react';
import { GOOGLE_CLIENT_ID } from '../../lib/config';

/**
 * Renders Google's own "Sign in with Google" button via Google Identity Services (GSI).
 * The GSI script tag lives in index.html. This component waits for `window.google` to be
 * ready, initializes it once per app load, and re-renders the button whenever it mounts
 * (e.g. switching between the login and register pages).
 *
 * onCredential receives the raw Google ID token (a JWT) — pass it straight to
 * `authApi.google` / `loginWithGoogle`, which sends it to the backend for verification.
 * The backend never trusts anything about the user except what it re-verifies itself.
 */
export function GoogleSignInButton({ onCredential, onError, text = 'continue_with' }) {
  const containerId = useId().replace(/:/g, '');
  const containerRef = useRef(null);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);

  // Callers pass inline arrow functions, which change identity every render. Read them through
  // refs so GSI is initialised once per mount instead of re-rendering the button on every keystroke.
  const onCredentialRef = useRef(onCredential);
  const onErrorRef = useRef(onError);
  useEffect(() => { onCredentialRef.current = onCredential; onErrorRef.current = onError; });

  useEffect(() => {
    if (!GOOGLE_CLIENT_ID) return undefined;
    let cancelled = false;
    let pollId;
    const deadline = Date.now() + 8000; // GSI script blocked (ad-blocker/offline) → show a message, not a skeleton forever

    const trySetup = () => {
      if (cancelled) return;
      if (!window.google?.accounts?.id) {
        if (Date.now() > deadline) { setFailed(true); return; }
        pollId = setTimeout(trySetup, 100);
        return;
      }
      window.google.accounts.id.initialize({
        client_id: GOOGLE_CLIENT_ID,
        callback: (response) => {
          if (response?.credential) onCredentialRef.current?.(response.credential);
          else onErrorRef.current?.(new Error('Google did not return a credential'));
        },
        auto_select: false,
        cancel_on_tap_outside: true,
      });
      if (containerRef.current) {
        window.google.accounts.id.renderButton(containerRef.current, {
          type: 'standard',
          theme: 'outline',
          size: 'large',
          text,
          shape: 'rectangular',
          logo_alignment: 'left',
          width: Math.min(containerRef.current.offsetWidth || 320, 400),
        });
      }
      setReady(true);
    };

    trySetup();
    return () => { cancelled = true; clearTimeout(pollId); };
  }, [text]);

  if (!GOOGLE_CLIENT_ID) {
    // Visible in development so a missing env var is obvious; hidden in production.
    return import.meta.env.DEV
      ? <p className="text-xs text-muted" style={{ textAlign: 'center' }}>Google sign-in is off: set <code>VITE_GOOGLE_CLIENT_ID</code> in <code>.env</code> and restart the dev server.</p>
      : null;
  }
  if (failed) {
    return <p className="text-xs text-muted" style={{ textAlign: 'center' }}>Google sign-in could not load. Check your connection or ad-blocker, or sign in with email.</p>;
  }

  return (
    <div>
      <div id={containerId} ref={containerRef} style={{ width: '100%', display: 'flex', justifyContent: 'center' }} />
      {!ready && <div className="skeleton" style={{ height: 40, borderRadius: 8 }} aria-hidden="true" />}
    </div>
  );
}
