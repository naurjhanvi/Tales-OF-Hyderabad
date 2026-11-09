# Tales of Hyderabad API

The Fastify and TypeScript API uses PostgreSQL for outlets, menu options, staff access, promotions, orders, simulated payment records and order history. Checkout accepts item selections rather than prices; the API validates availability and calculates the authoritative quote.

## Local setup

Requires Node.js 20 or newer and Docker Desktop with Docker Compose.

1. Copy `.env.example` to `.env` and set every required value. `DATABASE_URL` must use the same local database password as `POSTGRES_PASSWORD`. Set different random values of at least 32 characters for `JWT_SECRET` and `TRACKING_TOKEN_SECRET`. Choose staff passwords of at least 12 characters.
2. Start PostgreSQL and the API:

   ```powershell
   docker compose up -d postgres
   npm install
   npm run db:migrate
   npm run db:seed
   npm run dev
   ```

The API listens at `http://localhost:4000`. Check `/health/live` for process health and `/health/ready` for database readiness. The frontend origin defaults to `http://localhost:5173`.

`npm run db:seed` can be rerun. It refreshes the seeded menu, outlet coverage, staff accounts, three coupons and three identifiable order records without deleting other customer orders.

## API routes

All application routes are under `/api/v1`. Errors use `{ error: { code, message, details? }, requestId }`.

| Method | Path | Access | Purpose |
| --- | --- | --- | --- |
| `POST` | `/auth/login` | Public | Sign in an admin or kitchen account; returns an 8-hour JWT. |
| `GET` | `/auth/me` | Staff JWT | Return the current staff account. |
| `GET` | `/outlets?postalCode=500084` | Public | List outlets, optionally filtered by supported pincode. |
| `GET` | `/menu?outletId=kondapur` | Public | Read active menu items and outlet availability. |
| `GET` | `/promotions/available?outletId=kondapur` | Public | Read current outlet sales and available coupons. |
| `POST` | `/coupons/validate` | Public | Validate an outlet, basket and phone against a coupon. |
| `GET` | `/admin/menu` | Admin JWT | Read menu items, including inactive items. |
| `POST` | `/admin/menu` | Admin JWT | Add an item and its portions, spice levels, add-ons and availability. |
| `PUT` | `/admin/menu/:id` | Admin JWT | Replace an item and its option sets. |
| `PATCH` | `/admin/menu/:id/availability` | Admin JWT | Change availability for one outlet. |
| `PATCH` | `/admin/menu/:id/active` | Admin JWT | Restore or archive a menu item. |
| `DELETE` | `/admin/menu/:id` | Admin JWT | Soft-delete a menu item. |
| `GET` | `/admin/coupons` | Admin JWT | List coupons and redemption totals. |
| `POST` | `/admin/coupons` | Admin JWT | Create a coupon. |
| `PATCH` | `/admin/coupons/:code` | Admin JWT | Activate or deactivate a coupon. |
| `GET` | `/admin/sales` | Admin JWT | List item sales. |
| `PUT` | `/admin/menu/:id/sale` | Admin JWT | Set an outlet-specific item sale. |
| `DELETE` | `/admin/menu/:id/sale?outletId=kondapur` | Admin JWT | End an outlet-specific sale. |
| `POST` | `/orders` | Public | Create an order and simulated UPI/card payment. Requires `Idempotency-Key`. |
| `GET` | `/orders/:code` | Tracking token | Read an order using `X-Order-Tracking-Token`. |
| `GET` | `/orders/:code/events` | Tracking token | Stream order status changes using server-sent events. |
| `GET` | `/admin/orders` | Admin JWT | Read order and reporting records. |
| `GET` | `/kitchen/orders?outletId=kondapur` | Kitchen JWT or admin JWT | List recent outlet orders and late flags. Kitchen accounts are outlet-scoped. |
| `GET` | `/kitchen/orders/events?outletId=kondapur` | Kitchen JWT or admin JWT | Stream kitchen order changes. |
| `PATCH` | `/kitchen/orders/:code/status` | Kitchen JWT or admin JWT | Move an order to its next permitted status. |

## Order lifecycle and checkout

Kitchen status transitions are enforced in order: `placed → accepted → preparing → ready → out_for_delivery → delivered`. The first kitchen action records acceptance and preparation start in the timeline and immediately sets the customer-visible status to `preparing`. Status writes use a database transaction and PostgreSQL `NOTIFY`; the kitchen and customer event streams receive committed changes. Orders are marked late when their expected ready time passes before reaching `ready`.

The preparation estimate uses completed order history for the same outlet over the previous 30 days. With at least five completed examples it uses the median time from placement to ready; otherwise it uses the outlet's configured minimum. It adds up to 15 minutes for current kitchen load and up to 10 minutes for larger baskets, and never promises less than the outlet minimum. This is a transparent heuristic with a conservative fallback, not a trained machine-learning model.

Checkout recalculates prices, GST, sale pricing and coupon discounts from current database records. It stores the selected payment method and a simulated successful payment record; it does not contact a gateway or request payment credentials. The API returns a high-entropy tracking token and stores only its hash. An exact retry returns the same tracking token; reusing an idempotency key with a different request returns `409`.

Prices are stored in integer paise and exposed in rupees for the frontend. Menu image keys map to assets bundled with the frontend.
