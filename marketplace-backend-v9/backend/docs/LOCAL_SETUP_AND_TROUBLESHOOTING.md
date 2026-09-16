# Local setup & troubleshooting

Work through this top to bottom. Each step has an expected result; do not move on until you see it.
Almost every "nothing works" report on this project comes from steps 1–4.

## 1. MongoDB must be a replica set

Checkout uses transactions. A plain `mongod` is **not** a replica set and fails only at the first payment.

Pick one:
- **Docker (easiest):** in the backend folder run `docker compose up mongo`. Then `MONGO_URI=mongodb://localhost:27017/marketplace?replicaSet=rs0&directConnection=true`
- **Atlas M0 (free):** create a cluster, a DB user, allow your IP, copy the `mongodb+srv://` URI.

**Expected:** backend boot log shows `MongoDB connected` and **no** `MongoDB is a standalone server` error.

## 2. Backend `.env`

```bash
cp .env.example .env
openssl rand -hex 32   # run 3× → JWT_SECRET, COOKIE_SECRET, OTP_HASH_SECRET
```

Fill in: `MONGO_URI`, the three secrets, `GOOGLE_CLIENT_ID`, `RAZORPAY_KEY_ID` + `RAZORPAY_KEY_SECRET` (test mode), `CLOUDINARY_*`, `WHATSAPP_TOKEN` + `WHATSAPP_PHONE_NUMBER_ID`.

OTP codes are **always** delivered over WhatsApp — there is no console/log fallback in any environment. For local development add your own phone under *WhatsApp → API Setup → Test numbers* in Meta Business Manager; while the business account is unverified Meta only delivers to those numbers. The `sendOtp` function is mocked in the test suite.

**Expected:** `npm run dev` prints `API listening on port 5000`. If it prints `❌ Invalid environment configuration`, the listed variables are missing — the server refuses to start half-configured on purpose.

## 3. Frontend `.env`

```bash
cp .env.example .env
```

| Variable | Value |
|---|---|
| `VITE_API_BASE_URL` | `/api/v1` (leave as is — the Vite proxy forwards it to the backend) |
| `VITE_PROXY_TARGET` | `http://localhost:5000` |
| `VITE_GOOGLE_CLIENT_ID` | **same value** as backend `GOOGLE_CLIENT_ID` — if empty, the Google button does not render |
| `VITE_RAZORPAY_KEY_ID` | your `rzp_test_…` key id (public) |
| `VITE_OTP_DEV_HINT` | `true` locally so the checkout tells you to read the code from the terminal |

Restart `npm run dev` after any `.env` change — Vite reads it at startup only.

**Expected:** browser console shows no `[config] Missing in .env` warning.

## 4. Google Cloud console (for the Google button)

APIs & Services → Credentials → your OAuth 2.0 **Web application** client:
- **Authorised JavaScript origins:** `http://localhost:5173` **and** `http://localhost` (Google requires both for local dev), plus your production storefront origin.
- No redirect URI is needed (GSI uses a popup/One Tap).
- OAuth consent screen must be configured; while it is in "Testing" mode, only the test users you list can sign in.

**Expected:** the Google button renders on /login. Clicking it opens Google's account chooser. On success you land on the home page signed in.

## 5. Smoke test, in order

| # | Action | Expected |
|---|---|---|
| 1 | `GET http://localhost:5000/health` | `{"status":"ok"}` |
| 2 | Register with email/password | 201; you are **not** logged in yet (by design); verification email is logged (not sent) if `SMTP_USER`/`SMTP_PASS` are unset; set them to receive real mail locally |
| 3 | Log in | Redirect home; `/api/v1/auth/me` returns your user |
| 4 | Account → Become a seller | Store created; `/seller` dashboard loads |
| 5 | Add product with 1 image | Product appears in /products (public catalogue) |
| 6 | Add to cart → Checkout → enter phone → Send code | Backend terminal prints `🔑 [DEV] OTP for +91…: 123456` |
| 7 | Enter code | "Number verified"; continue to address |
| 8 | Pay | Razorpay test popup. Card `4111 1111 1111 1111`, any future expiry, any CVV, OTP `1234` on the bank page |
| 9 | After popup closes | Redirected to `/checkout/success/ORD-…`; product stock decreased by the quantity |
| 10 | Seller → Orders | Order listed with **only this seller's** items; "Confirm" → "Mark packed" → … buttons advance it |
| 11 | Account → My orders → open the order | Timeline follows the seller's updates |
| 12 | Sign out → /track-order with order id + same phone | Order shown after OTP |

Step 8's webhook won't fire locally (Razorpay can't reach localhost). That's fine — the browser path (`verify-payment`) completes the order. To test the webhook, expose the API with `ngrok http 5000` and set the webhook URL in the Razorpay dashboard to `https://<ngrok>/api/v1/checkout/webhook`.

## 6. Symptom → cause

| Symptom | Cause | Fix |
|---|---|---|
| Google button missing, no error | `VITE_GOOGLE_CLIENT_ID` empty | Set it (§3), restart Vite |
| Google button shows, click does nothing / console `origin_mismatch` or `The given origin is not allowed` | Origin not in Google console | §4 — add both localhost origins |
| Google login → 401 `Invalid Google token` | Frontend and backend client IDs differ | Both must be the **same** Web client ID |
| Every API call 404 | `VITE_API_BASE_URL` was unset in an older build (fallback was `/api`) | Fixed in code; set `/api/v1` anyway |
| Every API call "Could not reach the server" | Backend not running, or wrong `VITE_PROXY_TARGET` | Check `/health` in the browser |
| Login works but refresh logs you out / cookies not set | Frontend opened on a different origin than the proxy (e.g. `127.0.0.1` vs `localhost`) | Use `http://localhost:5173` consistently |
| "Send code" → 502 `Unable to send WhatsApp OTP` | Expired/temporary token, template not approved, or recipient not in Test numbers (unverified WABA) | Check the server log — the entry includes Meta's error code and an operator hint. Use a **permanent System User token**; add your phone under Test numbers |
| Code arrives as "Hello World" | Old build sent the test template | Fixed; production now uses `WHATSAPP_OTP_TEMPLATE` |
| Payment succeeds but page shows "could not confirm this payment" | Backend transaction failed — standalone Mongo | §1. Money is refunded automatically if the order was cancelled; check backend log |
| `Transaction numbers are only allowed on a replica set member` | Same as above | §1 |
| Product create → 400 on `unit` | Frontend unit list didn't match backend enum | Fixed; valid units are `pcs kg g pack liter` |
| Removing an image on product edit does nothing | Field name mismatch (`removeImagePublicIds[]`) | Fixed |
| Image upload → 500 | Cloudinary credentials wrong | Check the three `CLOUDINARY_*` values; the backend logs the Cloudinary error |
| 429 after a few logins | Rate limiter (20 auth attempts / 15 min per IP) | Wait, or restart the backend (in-memory store) |
| Seller pages 403 right after seller-setup | Shouldn't happen: the backend re-reads the role from the DB on every request | If it does, send me the network response |

## 7. Production differences

- `WHATSAPP_OTP_TEMPLATE` must be an **approved Authentication-category** template with a COPY_CODE button.
- `SMTP_USER` / `SMTP_PASS` are required (the server refuses to start without them) — see `.env.example` for Gmail App Password setup.
- `WHATSAPP_TOKEN` must be a permanent System User token from Meta Business Settings, not the 24-hour token from the API setup page.
- `CLIENT_URL` must be the exact storefront origin (scheme + host, no trailing slash). Cookies are `SameSite=None; Secure`, so HTTPS is mandatory.
- Razorpay: switch to live keys, re-create the webhook with the live secret, subscribe to `payment.captured` and `payment.failed`.
- Google console: add the production storefront origin; move the consent screen out of Testing.
