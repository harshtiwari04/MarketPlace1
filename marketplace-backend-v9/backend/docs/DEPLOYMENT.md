# Deployment on Render — cookies, proxies and 401s

## Why "401 after login" happens across two `*.onrender.com` subdomains

`onrender.com` is on the [Public Suffix List](https://publicsuffix.org/). That makes
`marketplace-web.onrender.com` and `marketplace-api.onrender.com` **different sites**, exactly like
`foo.github.io` vs `bar.github.io`. Consequences:

* The API's cookies are **third-party cookies** in the browser's eyes.
* `SameSite=None; Secure` is *required* for the browser to send them at all (the backend already does this in production).
* Safari (ITP), Brave, Firefox strict mode, and Chrome incognito **block third-party cookies regardless** of SameSite. Login returns 200 and sets the cookie, the browser discards it, and every next request is a 401.

There is no header combination that fixes this. The fix is to make the API **first-party**.

## Recommended: same-origin via Render static-site rewrite

The storefront's `render.yaml` already rewrites `/api/*` and `/sitemap.xml` to the API service.
With that in place the browser only ever talks to `marketplace-web.onrender.com`, so the cookie is
first-party and works in every browser.

Backend env for this mode:

| Var | Value | Why |
|---|---|---|
| `CLIENT_URL` | `https://marketplace-web.onrender.com` | still needed — browsers send `Origin` on same-origin POSTs |
| `COOKIE_SAME_SITE` | `lax` | first-party cookie; `none` would also work but `lax` is CSRF-safer |
| `TRUST_PROXY` | `2` | browser → static-site edge → API edge → app. With `1`, `req.ip` becomes the static edge's IP and **every user shares one rate-limit bucket** |

Frontend env: `VITE_API_BASE_URL=/api/v1`.

Verify after deploy: open DevTools → Network → the `/api/v1/auth/login` response should show
`Set-Cookie: access_token=…; Path=/; HttpOnly; Secure; SameSite=Lax` with **no** domain warning, and
`GET /api/v1/auth/me` should be 200. Also check `/health` logs show distinct client IPs.

## Alternative: direct cross-site calls

If you point `VITE_API_BASE_URL` at `https://marketplace-api.onrender.com/api/v1` instead:

| Var | Value |
|---|---|
| `COOKIE_SAME_SITE` | `none` (default in production) |
| `TRUST_PROXY` | `1` |
| `CLIENT_URL` | exact storefront origin |

This works in Chrome (non-incognito) and Edge today and **will fail** in Safari/Brave. Only use it
if you also put both services behind a custom domain you own (`shop.example.com` + `api.example.com`)
— then set `COOKIE_DOMAIN=.example.com` and they become same-site again.

## Checklist before going live

- [ ] `npm ci && npm run ci` passes (lint, typecheck, tests, build).
- [ ] All three secrets generated with `openssl rand -hex 32` (the server refuses placeholders in production).
- [ ] `SMTP_USER`/`SMTP_PASS` set; boot log shows `SMTP transport verified`.
- [ ] WhatsApp: permanent System User token; `otp_verification` template **approved** (Authentication category, COPY_CODE button); business verification complete or your test numbers added.
- [ ] Razorpay webhook URL = `https://<api>/api/v1/checkout/webhook`, events `payment.captured` + `payment.failed`, secret = `RAZORPAY_WEBHOOK_SECRET`.
- [ ] Atlas cluster is a replica set (any Atlas tier) — checkout uses transactions.
- [ ] Render plan ≥ Starter (free tier sleeps → webhooks and emails get dropped).
- [ ] If you scale to >1 instance: add `rate-limit-redis` as the store for `express-rate-limit` (one `store:` option per limiter) or limits multiply by instance count.
