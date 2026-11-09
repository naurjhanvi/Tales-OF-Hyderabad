# Tales of Hyderabad

Tales of Hyderabad is a direct-ordering application for a Hyderabad biryani chain. It connects a guest ordering journey to a central menu workspace, outlet kitchen boards, promotions and operational reporting.

## Open the application

When all local services are running, use one URL for every role:

**http://localhost:5173**

The frontend forwards API requests to the backend. The API health check is available at `http://localhost:4000/health/ready`.

## Run locally

Requirements: Docker Desktop, Node.js 20 or newer, and npm.

1. Copy `backend/.env.example` to `backend/.env`.
2. Set `POSTGRES_PASSWORD` to a local database password. Set `DATABASE_URL` to `postgres://tales:<same-password>@localhost:5432/tales_of_hyderabad`.
3. Set `JWT_SECRET` and `TRACKING_TOKEN_SECRET` to different random values of at least 32 characters. Set the admin and kitchen passwords to local reviewer passwords of at least 12 characters.
4. Start PostgreSQL from `backend`:

   ```powershell
   cd backend
   docker compose up -d postgres
   ```

5. In another terminal, prepare the database and start the API:

   ```powershell
   cd backend
   npm install
   npm run db:migrate
   npm run db:seed
   npm run dev
   ```

6. In a third terminal, start the frontend:

   ```powershell
   cd frontend
   npm install
   npm run dev
   ```

7. Open `http://localhost:5173`.

## Try the main flows

- **Customer:** choose “Order food,” continue as a guest, select an outlet, customize a menu item, apply a coupon in the cart, choose UPI or card, place the order and keep the tracking page open.
- **Kitchen:** open `/login/kitchen` and sign in with an outlet account. The first kitchen action accepts an order and immediately starts preparation; continue it to ready, rider handoff and delivery.
- **Menu admin:** open `/login/admin` to manage menu items, prices, outlet availability, sales and coupons. Review orders, outlet performance and recorded revenue from the dashboard.

The seed creates three active coupons: `WELCOME10` (10% off, ₹200 minimum, ₹100 cap), `HYD75` (₹75 off, ₹499 minimum), and `KONDAPUR20` (20% off at Kondapur, ₹200 minimum, ₹100 cap). It also creates one active order for each outlet so the kitchen boards and admin views have something to inspect. Rerunning the seed refreshes its own menu, offers, sample orders and staff accounts; it does not remove other customer orders.

UPI and card selection are simulated. The application records the selected method and a successful payment entry without contacting a payment gateway or collecting payment credentials.

## Storage

PostgreSQL runs in the Docker container `toh-postgres`. Its persistent volume is `toh-postgres-data`; the database is `tales_of_hyderabad`. View the volume in Docker Desktop or run this from `backend`:

```powershell
docker compose exec postgres psql -U tales -d tales_of_hyderabad
```

Useful queries:

```sql
SELECT order_code, status, total_paise, placed_at FROM orders ORDER BY placed_at DESC;
SELECT order_code, status, note, created_at FROM order_status_history ORDER BY created_at DESC;
SELECT code, active, ends_at FROM coupons ORDER BY code;
SELECT id, name, active, base_price_paise FROM menu_items ORDER BY category, name;
```

See `backend/README.md` for API routes and implementation details. Local environment values belong in `backend/.env`; never commit that file.
