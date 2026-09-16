# Marketplace v9 — Admin panel, analytics, delivery tracking

Builds on v8. All v8 files are included in the zips; this document lists only what v9 adds/changes.
No new npm dependencies. Run `npm run ci` in both repos before deploying.

## Audit result

| Requirement | Found in v8 | v9 action |
|---|---|---|
| 1. Admin dashboard & metrics | **Missing** — no `admin` role, no analytics endpoints, no admin UI | Built end-to-end (below) |
| 2. Product CRUD w/ role auth + images | **Complete** for sellers (`/seller/products` create/read/update/delete + status/stock/duplicate/CSV, multer→Cloudinary, `verifyJWT + requireSeller`, ownership on every query) | Left intact. Added admin oversight (list all, hide/show, delete) and factored asset cleanup into `product.service.ts` so both paths share it |
| 3. Order & delivery status tracking | **Partial** — per-item status machine (`placed→confirmed→packed→out_for_delivery→delivered`, `cancelled`) with history + buyer timeline existed; **no courier/tracking data** | Added `items[].delivery` sub-document, seller + admin endpoints, automatic `shippedAt`/`deliveredAt`, buyer-visible tracking UI. Status endpoints now also accept aliases `pending`/`processing`/`shipped`/`in_transit` |
| 4. Revenue by category | **Missing** — only per-seller totals existed | `analytics.service.getRevenueByCategory()` aggregation + dashboard chart |

## Backend

### Roles & access
| File | Change |
|---|---|
| `src/constants/index.ts` | `ROLES.ADMIN`, `ASSIGNABLE_ROLES`, `ORDER_STATUS_ALIASES`, `DELIVERY_EDITABLE_STATUSES`, `CARRIERS`, new error codes (`ADMIN_REQUIRED`, `ACCOUNT_SUSPENDED`, `INVALID_TRANSITION`, `DELIVERY_NOT_EDITABLE`) |
| `src/middlewares/auth.ts` | `requireRole(...roles)`, `requireAdmin`; `requireSeller` rebuilt on it. `resolveUser` now rejects **suspended** accounts on every request |
| `src/config/env.ts` | `ADMIN_EMAILS` (comma-separated) — promoted to admin on next sign-in |
| ★ `scripts/make-admin.ts` | `npm run make-admin -- email [admin\|seller\|buyer]` (revokes sessions so the role applies immediately) |
| `src/controllers/auth.controller.ts` | `recordLogin()` on login/Google: `lastLoginAt`, `loginCount`, ADMIN_EMAILS bootstrap; suspended → 403 |
| `src/models/User.ts` | `isSuspended`, `lastLoginAt`, `loginCount`; indexes for admin list/search |

### Analytics (`★ src/services/analytics.service.ts`)
Single definition everywhere: **recognised revenue = Σ price×qty over paid orders, excluding cancelled line items** (oversell refunds count ₹0). Ranges filter on order `createdAt`, default last 30 days.

| Endpoint (`/api/v1/admin/…`, admin only) | Returns |
|---|---|
| `GET analytics/overview?from&to` | users: total, byRole, verified, suspended, newInRange, **currentlyLoggedIn** (distinct users with a live refresh token), activeLast24h/7d · orders: total, inRange, paidInRange, byStatus, byPaymentStatus, AOV · revenue: recognised, grossPaid, cancelledOnPaid, unitsSold · products: total/active/outOfStock/lowStock/categories · sellers: total, withSalesInRange |
| `GET analytics/revenue-by-category?from&to` | `{ total, categories: [{ category, revenue, units, orders, products, share }] }` — `items.category` denormalised at checkout; legacy items resolve via conditional `$lookup`, deleted products → `uncategorized` |
| `GET analytics/revenue-timeseries?granularity=day\|week\|month` | `{ points: [{ period, revenue, orders, units }] }` (Asia/Kolkata buckets via `$dateTrunc`) |
| `GET analytics/top-products?limit`, `top-sellers?limit` | leaderboards |

### Admin oversight (`★ src/controllers/admin.controller.ts`, `★ src/routes/admin.routes.ts`, `★ src/validators/admin.validators.ts`)
- **Users**: `GET /users` (search name/email/phone/store, filter role/suspended/verified), `GET /users/:id` (+ paid orders, spend, active sessions), `PATCH /users/:id` (role, `storeName`, `isSuspended` → revokes all sessions; cannot demote/suspend self).
- **Orders**: `GET /orders` (status, payment, seller, date range, free-text over orderId/phone/email/paymentId/tracking no.), `GET /orders/:id` (all sellers' lines + `sellerInfo`), `PATCH /orders/:id/items/:productId/status|delivery`.
- **Products**: `GET /products` (all sellers, incl. hidden), `PATCH /products/:id/status`, `DELETE /products/:id`.
- Rate limits: `authedReadLimiter` on reads, new `adminWriteLimiter` on mutations. Every mutation is logged with `adminId`.

### Delivery tracking
| File | Change |
|---|---|
| `src/models/Order.ts` | `items[].category` (denormalised), `items[].delivery { carrier, carrierName, trackingNumber, trackingUrl, estimatedDeliveryAt, shippedAt, deliveredAt, notes }`, indexes for category revenue and tracking-number search |
| `src/services/order.service.ts` | `priceCart` copies `category` onto each line |
| ★ `src/services/order-status.service.ts` | `applyItemTransition()` (payment rule + transition table + auto timestamps + order aggregate — **shared by seller and admin**), `applyItemDelivery()` (editable only while confirmed/packed/out_for_delivery), `normalizeStatus()` (aliases) |
| `src/controllers/seller.controller.ts` | `updateItemStatus` uses the shared service; new `updateItemDelivery`; `deleteProduct` uses `product.service` |
| `src/validators/seller.validators.ts` | `deliveryUpdateSchema` (http(s)-only tracking URL, `''`/`null` clears a field), status schema accepts aliases |
| `src/routes/seller.routes.ts` | `PATCH /seller/orders/:id/items/:productId/delivery` |

### Tests (`★ tests/admin.test.ts`, `tests/helpers.ts`)
Access control (401/403, seller ⟂ admin surfaces), overview counts incl. logged-in sessions, revenue-by-category incl. legacy `$lookup` path, time series, top products, inverted range → 400, user search/suspend (session revoked), self-demotion guard, cross-seller order list + alias transition, product hide/delete, seller delivery flow (ownership, frozen after delivery, URL validation, buyer visibility).

## Frontend

| File | Change |
|---|---|
| `src/lib/endpoints.js` | `admin.*` namespace; `sellerOrders.updateItemDelivery` |
| `src/lib/normalize.js` | `normalizeDelivery`, `normalizeAdminUser`; items carry `category`, `delivery`, `sellerInfo` |
| `src/lib/orderStatus.js` | `CARRIERS`, `carrierLabel`, `canEditDelivery` |
| ★ `src/components/orders/DeliveryParts.jsx` | `DeliveryBlock` (read-only courier/tracking/ETA/timestamps) + `DeliveryForm` (modal, used by seller and admin) |
| `src/components/orders/OrderParts.jsx`, `OrderView.jsx` | Every line item renders its `DeliveryBlock` → buyers see tracking on **My orders** and **Track order** automatically |
| `src/pages/seller/OrderDetailPage.jsx` | "Add/Edit tracking" per item while editable |
| ★ `src/components/layout/AdminLayout.jsx`, `Guards.jsx` (`RequireAdmin`), `App.jsx` | `/admin` shell + routes |
| ★ `src/pages/admin/DashboardPage.jsx` | KPI cards (registered / logged-in / active / new users; recognised revenue, paid orders, AOV, refunded value), **revenue-by-category bars**, orders-by-status, revenue-over-time columns (day/week/month), top products, top sellers, date-range picker |
| ★ `src/pages/admin/UsersPage.jsx`, `UserDetailPage.jsx` | search/filter, role editor, suspend/reinstate |
| ★ `src/pages/admin/OrdersPage.jsx`, `OrderDetailPage.jsx` | all orders; per-line status + tracking controls with seller attribution |
| ★ `src/pages/admin/ProductsPage.jsx` | moderation (hide/show/delete) |
| ★ `src/components/admin/RangePicker.jsx`, `Charts.jsx` | dependency-free CSS charts (no chart library added) |
| `src/context/AuthContext.jsx`, `StorefrontLayout.jsx` | `isAdmin`; "Admin panel" menu entry |
| `src/styles/components.css` | `.bars`, `.spark`, `.range-picker` |

## Bootstrapping the first admin
1. Set `ADMIN_EMAILS=you@example.com` on the API service and sign in (or sign out/in) — **or** run `npm run make-admin -- you@example.com` against the production `MONGO_URI`.
2. Open `/admin`. Promote further admins from **Users → Edit**.

## Behaviour notes
- Admins do **not** get the seller workspace (separate surfaces; an admin who also sells needs a seller account). This keeps `/seller/*` queries strictly owner-scoped.
- Suspending a user revokes all sessions immediately and blocks login; data is retained.
- Existing orders lack `items[].category`; the category report resolves them via `$lookup` on the live product, so numbers are correct without a migration. New orders store it directly.
