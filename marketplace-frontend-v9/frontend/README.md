# Marketplace frontend

React + Vite frontend built around the backend flowchart. Read `docs/` first:

1. `docs/01-backend-analysis.md` — how each flowchart node maps to UI, plus assumptions A1–A6.
2. `docs/02-screen-map.md` — routes, roles, journeys, navigation.
3. `docs/03-api-contract.md` — the assumed endpoints (edit `src/lib/endpoints.js` to match your backend).
4. `docs/04-design-system.md` — tokens and components.

## Run locally

```bash
cp .env.example .env      # then fill in VITE_RAZORPAY_KEY_ID (public key only)
npm install
npm run dev               # http://localhost:5173, /api proxied to VITE_PROXY_TARGET
```

Review the generated code before running it against a real backend, and test against a non-production backend first.

## Structure

```
src/
  lib/          api client, endpoints, validators, formatters, razorpay loader
  context/      Auth, Cart, Toast
  hooks/        useAsync, useCountdown, useMediaQuery
  components/   ui (design system), layout, storefront, seller
  pages/        one file per route
  styles/       tokens.css, base.css, components.css, layout.css
```

## Orders & tracking (added)

- `/orders`, `/orders/:id` — signed-in buyer history (route-guarded, ownership enforced server-side).
- `/track-order` — guest tracking: order id + WhatsApp OTP re-verification. Pre-fills from `?orderId=`.
- `/seller/orders`, `/seller/orders/:id` — fulfilment: per-line-item status buttons; only this seller's items are ever returned.
- `/terms`, `/privacy`, `/refunds` — **draft** legal pages; fill the `[BRACKETS]` in `src/pages/legal/LegalPages.jsx` and get them reviewed.

## Quality & deployment

```bash
npm run lint      # eslint (eslint.config.js)
npm run build     # vite → dist/
npm run ci        # both
```

- CI: `.github/workflows/ci.yml` lints and builds on every push/PR.
- Render: import `render.yaml` as a Blueprint (static site with `/api/*` rewrite to the API).
- Self-host: `Dockerfile` + `nginx.conf` (replace `API_UPSTREAM`, e.g. `api:5000` in compose).
- SEO: `public/robots.txt` and the canonical/OG tags in `index.html` contain `YOUR-STOREFRONT-DOMAIN.example` — replace before launch.
