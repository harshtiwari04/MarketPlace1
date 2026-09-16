# Assumed API contract

Paths are relative to `VITE_API_BASE_URL` (default `/api`). Cookies are sent with every request. Every call lives in `src/lib/endpoints.js` — change paths there if the real backend differs.

Error envelope expected: `{ code?, message, errors?: { [field]: string }, retryAfterMs? }`.

| Method & path | Body | Success | Notable errors |
|---|---|---|---|
| `POST /auth/register` | `{name,email,password}` | `{ user }` | 400 `errors`, 409 `EMAIL_TAKEN` |
| `POST /auth/login` | `{email,password}` | `{ user }` + Set-Cookie | 401 |
| `GET /auth/me` | — | `{ user }` | 401 |
| `POST /auth/logout` | — | 204 | — |
| `POST /auth/seller-setup` | `{storeName, description?}` | `{ user }` role `seller` | 400, 401 |
| `GET /products` | `q,category,sort,page,limit` | `{ items,total,page,limit }` or `Product[]` | — |
| `GET /products/:id` | — | `Product` | 404 |
| `GET /seller/products` | — | `{ items }` or `Product[]` | 401, 403 |
| `GET /seller/products/:id` | — | `Product` | 401, 403, 404 |
| `POST /seller/products` | multipart `title,description,price,unit,category,images[]` | `Product` | 400 `errors`, 413 |
| `PUT /seller/products/:id` | multipart + `removeImagePublicIds[]` | `Product` | 400, 404 |
| `POST /otp/send-whatsapp` | `{phone}` | `{ expiresInMs?, cooldownMs? }` | 429 `OTP_COOLDOWN` (+`Retry-After`/`retryAfterMs`) |
| `POST /otp/verify-whatsapp` | `{phone, code}` | `{ phoneVerificationToken }` | 400 `OTP_INVALID`, 410 `OTP_EXPIRED` |
| `POST /orders/create-order` | `{ items:[{productId,quantity}], customer:{name,email?,phone}, address:{line1,line2?,city,state,postalCode}, phoneVerificationToken }` | `{ orderId, razorpayOrderId, amount, currency, keyId? }` | 400 `errors`, 401/403 `PHONE_VERIFICATION_REQUIRED` |
| `POST /payments/verify-payment` | `{ razorpay_order_id, razorpay_payment_id, razorpay_signature }` | `{ orderId, status:'paid' }` | 400 `INVALID_SIGNATURE` |

`Product` normalised by `src/lib/normalize.js`: `{ id, title, description, price, unit, category, images:[{url, publicId}], createdAt }`.
