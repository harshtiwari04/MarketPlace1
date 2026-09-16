import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { auth as authApi } from '../lib/endpoints';
import { useToast } from './ToastContext';

const AuthContext = createContext(null);

/**
 * Session is a JWT cookie issued by the Login Controller. The browser holds it;
 * this context only holds the user object and the loading status.
 * status: 'loading' | 'authenticated' | 'guest'
 */
export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [status, setStatus] = useState('loading');
  const toast = useToast();
  const wasAuthed = useRef(false);

  useEffect(() => {
    const ctrl = new AbortController();
    authApi.me({ signal: ctrl.signal })            // A3
      .then((u) => { setUser(u); setStatus('authenticated'); wasAuthed.current = true; })
      .catch(() => { setUser(null); setStatus('guest'); });
    return () => ctrl.abort();
  }, []);

  // Any 401 from the API means the cookie is gone/expired.
  useEffect(() => {
    const onUnauthorized = () => {
      if (wasAuthed.current) toast?.info('Session expired', 'Sign in again to continue where you left off.');
      wasAuthed.current = false;
      setUser(null);
      setStatus('guest');
    };
    window.addEventListener('auth:unauthorized', onUnauthorized);
    return () => window.removeEventListener('auth:unauthorized', onUnauthorized);
  }, [toast]);

  const login = useCallback(async (creds) => {
    const u = await authApi.login(creds);
    setUser(u); setStatus('authenticated'); wasAuthed.current = true;
    return u;
  }, []);

  const loginWithGoogle = useCallback(async (idToken) => {
    const u = await authApi.google(idToken);
    setUser(u); setStatus('authenticated'); wasAuthed.current = true;
    return u;
  }, []);

  const register = useCallback((body) => authApi.register(body), []); // A1: no auto-login

  const logout = useCallback(async () => {
    try { await authApi.logout(); } catch { /* cookie may already be gone */ }
    wasAuthed.current = false;
    setUser(null); setStatus('guest');
  }, []);

  const sellerSetup = useCallback(async (body) => {
    const u = await authApi.sellerSetup(body);   // A2: returns updated user (role = seller)
    setUser(u);
    return u;
  }, []);

  /** Re-fetches the current user — e.g. after verifying an email, to pick up isEmailVerified. */
  const refresh = useCallback(async () => {
    try {
      const u = await authApi.me();
      setUser(u); setStatus('authenticated'); wasAuthed.current = true;
      return u;
    } catch {
      return null;
    }
  }, []);

  const value = useMemo(() => ({
    user, status,
    isAuthenticated: status === 'authenticated',
    isSeller: user?.role === 'seller',
    isAdmin: user?.role === 'admin',
    login, loginWithGoogle, register, logout, sellerSetup, refresh,
  }), [user, status, login, loginWithGoogle, register, logout, sellerSetup, refresh]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
