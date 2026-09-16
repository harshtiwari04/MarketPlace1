# Screen map

## Roles
- **Guest** — browse, cart, checkout with WhatsApp phone verification.
- **User** — Guest abilities + signed-in session; can start Seller setup.
- **Seller** — User abilities + seller workspace (products).

## Pages

| Route | Page | Who | Backend operation(s) |
|---|---|---|---|
| `/` | Home | all | `GET /products` (A4) |
| `/products` | Catalog: search, category, sort, pagination | all | `GET /products?q&category&sort&page&limit` (A4) |
| `/products/:id` | Product detail | all | `GET /products/:id` (A4) |
| `/cart` | Cart | all | none (client state, A6) |
| `/checkout` | Checkout: 1 Contact & phone → 2 Delivery → 3 Review & pay | all | `POST /otp/send-whatsapp`, `POST /otp/verify-whatsapp`, `POST /orders/create-order`, Razorpay Checkout, `POST /payments/verify-payment` |
| `/checkout/success/:orderId` | Order confirmed | all | data from verify-payment response |
| `/login` | Sign in | guest | `POST /auth/login` |
| `/register` | Create account | guest | `POST /auth/register` |
| `/seller/setup` | Become a seller | User | `POST /auth/seller-setup` (A2) |
| `/seller` | Seller dashboard | Seller | `GET /seller/products` |
| `/seller/products` | My products | Seller | `GET /seller/products` |
| `/seller/products/new` | Add product | Seller | `POST /seller/products` (multipart) |
| `/seller/products/:id/edit` | Edit product | Seller | `GET /seller/products/:id`, `PUT /seller/products/:id` (multipart + `removeImagePublicIds[]`) |
| `/403` | Not allowed | all | — |
| `*` | Not found | all | — |

## Major journeys
1. **Guest buys**: Home → Catalog → Product → Add to cart → Cart → Checkout (send code → verify → address → review) → Razorpay → verify → Confirmed.
2. **User buys**: Login → as above with name/email prefilled; phone verification still required.
3. **User becomes seller**: Register → Login → Account menu → Seller setup → Dashboard.
4. **Seller manages catalogue**: Dashboard → Add product → My products → Edit (remove/add images) → Save.
5. **Session expires** (401): toast + redirect to Login with return path; cart and checkout input preserved.
6. **Phone token missing/expired at create-order**: back to step 1 with message; other steps preserved.

## Navigation
- Storefront header: logo, search, Products, Cart (count), Account menu.
- Mobile: bottom tab bar (Home, Products, Cart, Account); seller sidebar becomes a drawer.
- Seller sidebar: Dashboard, My products, Add product, Back to store.
