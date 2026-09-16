# Marketplace Backend (Node 20 · Express · TypeScript · MongoDB)

Production-oriented API for a multi-seller, Amazon-style storefront with guest checkout,
Cloudinary image pipeline, Razorpay payments and WhatsApp Cloud API OTP / order notifications.

> ⚠️ Review every file before running it, and exercise the full flow in a non-production
> environment (Razorpay test mode, a WhatsApp test number, a dev Cloudinary account) first.

## Directory tree

```
src/
├── app.ts                        Express app: helmet, CORS(credentials), compression, morgan,
│                                 JSON (+rawBody capture), cookie-parser (signed), mongo-sanitize, limiter
├── server.ts                     DB bootstrap, HTTP listener, graceful shutdown
├── config/
│   ├── env.ts                    Zod-validated environment (fails fast)
│   ├── db.ts                     Mongoose connection
│   ├── cloudinary.ts             Cloudinary SDK + multer-storage-cloudinary engine
│   ├── razorpay.ts               Razorpay SDK client
│   ├── whatsapp.ts               Axios client for Meta Graph API
│   └── googleAuth.ts             google-auth-library OAuth2Client
├── constants/index.ts            Roles, units, order/payment enums, status state-machine, HTTP codes, messages
├── controllers/                  auth · otp · product (public) · seller · checkout
├── middlewares/
│   ├── auth.ts                   verifyJWT · optionalAuth · requireSeller · requireRegistered · requirePhoneVerification
│   ├── upload.ts                 multer → Cloudinary (jpeg/png/webp, 5 MB, max 6)
│   ├── validate.ts               Zod body/params validation
│   ├── rateLimit.ts              global / auth / otp / checkout limiters
│   └── error.ts                  404 + central error normaliser (Zod, Mongoose, Multer, JWT, dup-key)
├── models/                       User · Product · Order · OtpSession (TTL index)
├── routes/                       /auth · /otp · /products · /seller · /checkout  (mounted at /api/v1)
├── services/
│   ├── razorpay.service.ts       order create · checkout HMAC · webhook HMAC · refund
│   ├── whatsapp.service.ts       template sender: OTP, order confirmation, status update
│   ├── cloudinary.service.ts     batch asset deletion
│   ├── otp.service.ts            cooldown, HMAC-hashed OTP, 3-attempt cap, 15-min verification token
│   ├── order.service.ts          server-side cart re-pricing (integer paisa)
│   └── stock.service.ts          transactional stock deduction + idempotent "mark paid" + oversell refund
├── types/                        Shared interfaces + Express.Request augmentation
├── utils/                        ApiError · ApiResponse · asyncHandler · token · crypto · slugify · logger · phone
└── validators/                   Zod schemas per domain
```

## Quick start

```bash
cp .env.example .env          # fill in real values (see below)
npm install
npm run dev                   # tsx watch
npm run typecheck && npm run build && npm start
```

**MongoDB must be a replica set** — `finalizePaidOrder` uses a multi-document transaction.
Atlas clusters qualify; locally run `mongod --replSet rs0` and `rs.initiate()` once.

## Endpoints (`/api/v1`)

| Method | Path | Guard | Purpose |
|---|---|---|---|
| POST | `/auth/register` · `/auth/login` | rate-limited | Email/password → signed HTTP-only JWT cookie |
| POST | `/auth/google` | rate-limited | Verify Google ID token, upsert user, set cookie |
| POST | `/auth/guest` | – | Stateless guest JWT for cart tracking |
| POST | `/auth/logout` · GET `/auth/me` | – / JWT | Clear cookie / current identity |
| POST | `/otp/send-whatsapp` | limiter + 60 s cooldown | 6-digit code, HMAC-hashed, 5-min TTL, sent via template |
| POST | `/otp/verify-whatsapp` | limiter, 3 attempts | Returns `phoneVerificationToken` (15 min) |
| GET | `/products` | public | Faceted search: `category, q, minPrice, maxPrice, inStock, sort, page, limit` |
| GET | `/products/:slug` | public | Product detail + stock status |
| GET/POST | `/seller/products` | JWT + seller | List / create (multipart `images[]`) |
| PUT/DELETE | `/seller/products/:id` | JWT + seller | Update (add/remove images) / soft delete + Cloudinary cleanup |
| GET | `/seller/orders` · `/seller/orders/:id` | JWT + seller | Filter by `status`, `paymentStatus`, `phone` |
| PATCH | `/seller/orders/:id/items/:productId/status` | JWT + seller | Per-line-item state-machine transition; order status is re-derived + WhatsApp notification |
| GET | `/orders` · `/orders/:id` | JWT (registered) | Buyer order history / detail — scoped to `buyer.userId`, 404 on mismatch |
| POST | `/orders/track` | `x-phone-verification-token` | Guest tracking: `{ orderId }` + verified phone must both match |
| GET | `/sitemap.xml` (root, not `/api/v1`) | public | Storefront sitemap built from the live catalogue |
| POST | `/checkout/create-order` | `x-phone-verification-token` | Re-prices cart, creates Razorpay order, stores pending Order |
| POST | `/checkout/verify-payment` | – | HMAC check → transactional stock deduction → paid → WhatsApp confirmation |
| POST | `/checkout/webhook` | HMAC (raw body) | `payment.captured` (idempotent finalize) / `payment.failed` |

### Checkout sequence (frontend)

1. `POST /otp/send-whatsapp { phone }` → `POST /otp/verify-whatsapp { phone, code }` → keep `phoneVerificationToken`.
2. `POST /checkout/create-order` with header `x-phone-verification-token` and `{ items, shippingAddress, email? }`
   → receive `razorpayOrderId, amount, currency, keyId, prefill`.
3. Open Razorpay Checkout.js with those values. On `handler`, forward
   `{ razorpay_order_id, razorpay_payment_id, razorpay_signature }` to `POST /checkout/verify-payment`.
4. The webhook independently finalizes the order if the browser dropped off. Both paths are idempotent.

## WhatsApp templates (must be approved in Meta Business Manager)

| Env var | Category | Body params | Buttons |
|---|---|---|---|
| `WHATSAPP_OTP_TEMPLATE` | Authentication | `{{1}}` code | COPY_CODE (index 0) |
| `WHATSAPP_ORDER_TEMPLATE` | Utility | `{{1}}` order id · `{{2}}` item summary · `{{3}}` total | – |
| `WHATSAPP_STATUS_TEMPLATE` | Utility | `{{1}}` order id · `{{2}}` status label | – |

## Security notes

- Secrets belong in a managed store (Azure Key Vault or equivalent), never in the repo; `.env` is git-ignored.
- JWT lives in a **signed, HTTP-only** cookie (`sameSite=none; secure` in prod for cross-site SPAs). A `Bearer` header is also accepted for non-browser clients.
- OTPs are HMAC-hashed with a server pepper, single-session-per-phone, capped at 3 attempts and TTL-expired by MongoDB.
- Totals are recomputed from the DB in integer paisa; client prices are ignored.
- Stock is decremented with `{ stock: { $gte: qty } }` conditional `$inc` inside a transaction — it can never go negative. If a payment captures after stock ran out, the order is recorded `paid + cancelled` and an automatic refund is issued.
- Both Razorpay signatures are checked with constant-time comparison; the webhook HMAC is computed over the **raw** request bytes.
- `express-mongo-sanitize` blocks operator injection; regex search input is escaped.

## Production hardening checklist

- Set `autoIndex=false` and build indexes via a migration; confirm the `OtpSession.expiresAt` TTL index exists.
- Put the API behind TLS and a WAF; keep `trust proxy` aligned with your ingress hop count.
- Move WhatsApp/Cloudinary side-effects to a queue (e.g. BullMQ, Azure Service Bus) for retries.
- Add structured logging (pino) with request IDs, and alerting on `Automatic refund failed`.
- Pin dependency versions from a lockfile and run `npm audit` in CI; versions in `package.json` are starting points.
- Rotate every secret that has ever been shared outside a secret store (chat, zip, screenshot). `.env` is git-ignored, but that only protects the repo.

## Development workflow

```bash
npm run lint          # eslint (flat config, eslint.config.mjs)
npm run typecheck     # tsc --noEmit
npm test              # vitest against an in-memory MongoDB replica set (first run downloads mongod, ~100MB, cached)
npm run test:coverage
npm run ci            # everything CI runs, in order
```

Tests live in `tests/` and use `supertest` against the real Express app. External providers
(Razorpay, WhatsApp, Cloudinary) are mocked per test file with `vi.mock`; everything else — auth,
transactions, validation, rate-limit bypass — is exercised for real. `tests/helpers.ts` has factories
for users, sellers, products and orders.

CI (`.github/workflows/ci.yml`) runs lint → typecheck → test → build on every push to `main` and
every pull request, then does a smoke Docker build.

## Deployment

**Recommended: Render (or Railway) + MongoDB Atlas.** Both platforms build the included `Dockerfile`
from a git push and give you TLS, health-check restarts and log streaming without managing an OS.
Atlas's free M0 cluster is a replica set, which the transactional checkout requires.

```bash
docker build -t marketplace-api .           # what Render/Railway build
docker compose up --build                   # local: API + single-node Mongo replica set
```

`render.yaml` is a Blueprint you can import in the Render dashboard ("New → Blueprint"). Fill in the
`sync: false` secrets there; the three signing secrets are generated by Render on first deploy.

After the first deploy:

1. Set `CLIENT_URL` to the exact storefront origin(s). Auth cookies are `SameSite=None; Secure`, so
   cross-origin (storefront on one domain, API on another) works — but CORS still needs the exact origin.
2. Point the Razorpay webhook at `https://<api-host>/api/v1/checkout/webhook` and paste the webhook
   secret into `RAZORPAY_WEBHOOK_SECRET`.
3. Add the API host to the Google OAuth client's authorised origins only if you serve the SPA from it;
   otherwise only the storefront origin needs to be there.
4. Check `/health` returns 200 and `/sitemap.xml` lists your products.

The free/starter Render plan sleeps after inactivity, which delays webhook delivery and the first
request after idle by ~30 s — acceptable for staging, not for taking real orders. Upgrade the API
service (not the static site) when you go live.

## Admin panel (v9)

Role `admin` (assigned via `ADMIN_EMAILS` on next sign-in, `npm run make-admin -- email`, or by another
admin in the panel) unlocks `/api/v1/admin/*` and the `/admin` UI:

| Endpoint | Purpose |
|---|---|
| `GET /admin/analytics/overview?from&to` | registered users by role, verified/suspended, **currently logged in** (live refresh tokens), active 24h/7d; orders by status/payment; recognised vs gross revenue; product inventory health |
| `GET /admin/analytics/revenue-by-category?from&to` | Σ(price×qty) of paid, non-cancelled line items grouped by product category, with share % |
| `GET /admin/analytics/revenue-timeseries?granularity=day\|week\|month` | revenue/orders/units per period (Asia/Kolkata buckets) |
| `GET /admin/analytics/top-products`, `/top-sellers` | leaderboards |
| `GET/PATCH /admin/users[/:id]` | search, change role, suspend (revokes sessions) |
| `GET /admin/orders[/:id]`, `PATCH …/items/:productId/status\|delivery` | cross-seller order oversight |
| `GET /admin/products`, `PATCH …/:id/status`, `DELETE …/:id` | moderation |

**Revenue definition** used everywhere: paid orders only, cancelled line items excluded (so oversell
refunds contribute ₹0). Date filters apply to the order's `createdAt`.

### Delivery tracking (v9)

Each order line item carries `delivery { carrier, carrierName, trackingNumber, trackingUrl,
estimatedDeliveryAt, shippedAt, deliveredAt, notes }`. Sellers set courier details via
`PATCH /seller/orders/:id/items/:productId/delivery` while the item is confirmed/packed/out_for_delivery;
`shippedAt`/`deliveredAt` are stamped automatically by the status machine. Status endpoints also
accept the aliases `pending`, `processing`, `shipped`, `in_transit`.
