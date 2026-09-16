# Backend analysis (source: Marketplace Backend Flowchart)

The frontend is built strictly around the four backend modules in the flowchart. Nothing below changes backend logic; where the chart is silent, the gap is listed as an **assumption** and referenced in code comments as A1…A6.

## 1. Authentication & user lifecycle (blue)

| Flowchart node | Frontend handling |
|---|---|
| Register Controller → new user document in MongoDB | Register form (name, email, password). After success, route to Login. **A1:** register does not auto-issue the JWT cookie (only Login is shown issuing it). |
| Login Controller → JWT access token **cookie** issued | Login form. All requests use `credentials: 'include'`; the frontend never reads or stores the token. |
| Seller Setup → `User Role == Seller?` → seller module | A signed-in user with role `user` completes Seller setup; on success role becomes `seller`. **A2:** endpoint returns the updated user. |
| (implicit) | **A3:** a `GET /auth/me` exists to restore the session on page load. |

Roles: **Guest** (no JWT), **User** (JWT, role `user`), **Seller** (JWT, role `seller`). Buyers may be Guest or User (`optionalAuth` on create-order).

## 2. Seller product management (green)

Middleware: `verifyJWT` → `requireSeller`. 401 → session expired; 403 → not a seller → Seller setup.

| Node | Frontend handling |
|---|---|
| List Products | Seller "My products" view. |
| Create/Update Product → multipart (`title, description, price, unit, category, images`) | One form for create and edit, submitted as `FormData`. Example values from chart: `unit=pcs`, `category=electronics`. |
| Cloudinary upload → secure public URLs → save in MongoDB | Submit shows upload state; returned URLs are rendered. |
| `removeImagePublicIds present?` → Cloudinary delete | Edit form lets sellers remove existing images; their `publicId`s go in `removeImagePublicIds[]`; new files go in `images`. |

**Not in the chart, therefore not built:** product delete, stock, seller order history, seller analytics. Dashboard stats are product-derived only.

**A4:** a *public* product list/detail endpoint exists for buyers. The chart only shows seller-scoped List Products, but guest checkout requires buyers to see products.

## 3. Guest OTP & checkout (orange)

| Node | Frontend handling |
|---|---|
| `send-whatsapp` (rate-limited) → `Cooldown OK?` | "Send code on WhatsApp"; on 429 read `Retry-After`/`retryAfterMs` → countdown, resend disabled. TTL drives an expiry timer. |
| Meta Graph API (`hello_world` template) → Log OTP | UI tells the user to expect a WhatsApp message. **A5:** in dev the code may only be logged server-side; a dev hint is shown when `VITE_OTP_DEV_HINT=true`. |
| `verify-whatsapp` → Match → `phoneVerificationToken` | 6-box OTP input; token kept in memory for this checkout only. |
| `optionalAuth` + `validateSchema` → `create-order` | Submit `items[]`, `customer`, `address`, `phoneVerificationToken`. 400 field errors render inline. |
| `requirePhoneVerification`: no token → Start Guest OTP | 401/403 `PHONE_VERIFICATION_REQUIRED` → back to phone step, all other input preserved. |
| Calculate amount → pending order → Razorpay → `razorpay_order_id` | Server owns pricing. Cart totals labelled as estimates until server `amount` arrives. |

**A6:** cart is client-side state (no cart module in the chart), persisted in `localStorage`.

## 4. Payment flow (red)

| Node | Frontend handling |
|---|---|
| Razorpay Checkout UI | Script loaded lazily on the pay step with `order_id`, `amount`, `key_id`. |
| `verify-payment` | Success handler posts `razorpay_order_id`, `razorpay_payment_id`, `razorpay_signature`. |
| HMAC match → Paid → fulfilment | Success screen. 400 `INVALID_SIGNATURE` → failed state with retry. |

### Security note: "Pre-request Script (or Frontend JS)" box
The chart computes the HMAC with `RAZORPAY_KEY_SECRET` in a Postman pre-request script *or* frontend JS. That is a **Postman testing mock only**. The secret must never ship to the browser. In production Razorpay Checkout returns `razorpay_signature` in its success callback and the server recomputes the HMAC. This frontend forwards the signature and never holds the secret — the only place it deliberately does not mirror a box in the chart.

## Cross-cutting behaviours
- 401 anywhere → "session expired" toast, auth cleared, redirect to Login with `returnTo`.
- 403 in seller routes → Not-allowed screen with "Become a seller".
- Network failure → `ApiError(status 0, code NETWORK)` → retry UI.
- Loading → skeletons; empty → empty states with an action; server errors → error states with retry.
