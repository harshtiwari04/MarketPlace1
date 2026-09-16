import { API_BASE } from './config';

/**
 * Note on transport: this wrapper uses `fetch` with `credentials: 'include'`, which is the exact
 * equivalent of Axios' `withCredentials: true` — the browser attaches the HttpOnly session cookies
 * to every request (same-origin *and* cross-origin, subject to the server's CORS `credentials`
 * and the cookie's SameSite/Secure attributes). See backend docs/DEPLOYMENT.md for why the
 * same-origin `/api` rewrite is the reliable setup on Render.
 */
export class ApiError extends Error {
  constructor({ status, code, message, errors, details, retryAfterMs }) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code || null;           // stable backend identifier, e.g. 'EMAIL_NOT_VERIFIED'
    this.errors = errors || null;       // { field: message } — for form fields
    this.details = details ?? null;     // raw backend details (array or object)
    this.retryAfterMs = retryAfterMs ?? null;
  }
  get isNetwork() { return this.status === 0; }
  get isAuth() { return this.status === 401; }
  get isForbidden() { return this.status === 403; }
  get isValidation() { return this.status === 400 || this.status === 422; }
  get isRateLimited() { return this.status === 429; }
}

const DEFAULT_MESSAGES = {
  0: 'Could not reach the server. Check your connection and try again.',
  400: 'Some of the information provided is not valid.',
  401: 'Your session has expired. Sign in to continue.',
  403: 'You do not have access to this.',
  404: 'Not found.',
  409: 'This already exists.',
  413: 'The files are too large.',
  429: 'Too many attempts. Please wait a moment.',
  500: 'Something went wrong on our side. Try again in a moment.',
  502: 'A service we depend on is not responding. Try again shortly.',
  503: 'The service is briefly unavailable. Try again in a moment.',
};

/**
 * The backend returns validation errors as `details: [{ path: 'shippingAddress.city', message }]`.
 * Forms want `{ city: message }`. Map both the full dotted path and its last segment so callers
 * can look up either. Object-shaped `errors`/`details` pass through unchanged.
 */
function toFieldErrors(data) {
  if (data?.errors && typeof data.errors === 'object' && !Array.isArray(data.errors)) return data.errors;
  const details = data?.details;
  if (!Array.isArray(details)) return null;
  const out = {};
  for (const d of details) {
    if (!d || typeof d.path !== 'string' || !d.path) continue;
    const leaf = d.path.split('.').pop();
    out[d.path] = out[d.path] || d.message;
    if (leaf && !out[leaf]) out[leaf] = d.message;
  }
  return Object.keys(out).length ? out : null;
}

function retryAfterFrom(res, data) {
  const fromBody = data?.retryAfterMs ?? data?.details?.retryAfterMs;
  if (fromBody) return Number(fromBody);
  const h = res.headers.get('Retry-After');
  if (!h) return null;
  const secs = Number(h);
  return Number.isFinite(secs) ? secs * 1000 : Math.max(0, new Date(h).getTime() - Date.now());
}

// Endpoints where a 401 means "wrong credentials" / "already logged out", not "session expired" —
// retrying these via refresh would be meaningless or create a loop.
const NO_REFRESH_RETRY_PREFIXES = ['/auth/refresh', '/auth/login', '/auth/register', '/auth/google', '/auth/logout', '/auth/guest'];

// Codes for which a 401/403 is about *this request*, not about the session — never clear the session for them.
const NON_SESSION_CODES = new Set(['PHONE_VERIFICATION_REQUIRED', 'PHONE_VERIFICATION_EXPIRED', 'EMAIL_NOT_VERIFIED', 'INVALID_CREDENTIALS']);

// Dedupes concurrent refresh attempts: if five requests 401 at once, only one /auth/refresh goes out.
let refreshInFlight = null;
function attemptRefresh() {
  if (!refreshInFlight) {
    refreshInFlight = fetch(`${API_BASE}/auth/refresh`, { method: 'POST', credentials: 'include', headers: { Accept: 'application/json' } })
      .then((r) => r.ok)
      .catch(() => false)
      .finally(() => { refreshInFlight = null; });
  }
  return refreshInFlight;
}

/**
 * Thin fetch wrapper. Always sends cookies. On a 401 from an already-authenticated call, silently
 * attempts to refresh the session and retries the request once before giving up. Emits
 * `auth:unauthorized` only once that retry also fails, so AuthContext can reset the session globally.
 */
export async function api(path, { method = 'GET', body, headers = {}, signal, timeoutMs = 30_000 } = {}, _isRetry = false) {
  const isForm = body instanceof FormData;

  // Per-request timeout that still honours a caller-supplied AbortSignal.
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(new DOMException('Request timed out', 'TimeoutError')), timeoutMs);
  const onOuterAbort = () => ctrl.abort(signal?.reason);
  if (signal) { if (signal.aborted) onOuterAbort(); else signal.addEventListener('abort', onOuterAbort, { once: true }); }

  let res;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      method,
      credentials: 'include',
      headers: isForm ? { Accept: 'application/json', ...headers } : { 'Content-Type': 'application/json', Accept: 'application/json', ...headers },
      body: isForm ? body : body !== undefined ? JSON.stringify(body) : undefined,
      signal: ctrl.signal,
    });
  } catch (err) {
    if (err?.name === 'AbortError' && signal?.aborted) throw err; // caller cancelled — propagate
    if (err?.name === 'TimeoutError' || (err?.name === 'AbortError' && !signal?.aborted)) {
      throw new ApiError({ status: 0, code: 'TIMEOUT', message: 'The request took too long. Check your connection and try again.' });
    }
    throw new ApiError({ status: 0, code: 'NETWORK', message: DEFAULT_MESSAGES[0] });
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', onOuterAbort);
  }

  let data = null;
  const text = await res.text();
  if (text) { try { data = JSON.parse(text); } catch { data = { message: text }; } }

  if (!res.ok) {
    const code = data?.code || null;
    const isSessionError = res.status === 401 && !NON_SESSION_CODES.has(code);
    const canRetryViaRefresh = isSessionError && !_isRetry && !NO_REFRESH_RETRY_PREFIXES.some((p) => path.startsWith(p));

    if (canRetryViaRefresh) {
      const refreshed = await attemptRefresh();
      if (refreshed) return api(path, { method, body, headers, signal, timeoutMs }, true);
    }
    if (isSessionError) window.dispatchEvent(new CustomEvent('auth:unauthorized'));

    throw new ApiError({
      status: res.status,
      code,
      message: data?.message || data?.error || DEFAULT_MESSAGES[res.status] || DEFAULT_MESSAGES[500],
      errors: toFieldErrors(data),
      details: data?.details,
      retryAfterMs: retryAfterFrom(res, data),
    });
  }
  return data;
}

export const get = (path, opts) => api(path, { ...opts, method: 'GET' });
export const post = (path, body, opts) => api(path, { ...opts, method: 'POST', body });
export const put = (path, body, opts) => api(path, { ...opts, method: 'PUT', body });
export const patch = (path, body, opts) => api(path, { ...opts, method: 'PATCH', body });
export const del = (path, opts) => api(path, { ...opts, method: 'DELETE' });
