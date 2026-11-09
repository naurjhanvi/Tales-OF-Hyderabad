# Deployment guide

## Current deployment

There is no hosted deployment yet. Run the application locally with Docker Desktop, PostgreSQL, the API and the web server. The customer, kitchen and admin experiences share one browser URL: `http://localhost:5173`.

## Requirements

- Docker Desktop with Docker Compose
- Node.js 20 or newer and npm
- The public source repository: https://github.com/naurjhanvi/Tales-OF-Hyderabad

## Local setup

1. Clone the repository and open its folder in PowerShell.
2. Copy `backend/.env.example` to `backend/.env`.
3. Generate separate random values of at least 32 characters for `JWT_SECRET` and `TRACKING_TOKEN_SECRET`. Generate a database password and use it for both `POSTGRES_PASSWORD` and the password portion of `DATABASE_URL`. Keep all these values in the local `.env` file only.
4. Set the local reviewer account values shown under **Reviewer sign-in** below. Set `FRONTEND_ORIGIN` to `http://localhost:5173`.
5. Start the database from the `backend` directory:

   ```powershell
   cd backend
   docker compose up -d postgres
   ```

6. In that same directory, migrate the schema, add starter data and start the API:

   ```powershell
   npm install
   npm run db:migrate
   npm run db:seed
   npm run dev
   ```

7. In a second terminal, start the frontend:

   ```powershell
   cd frontend
   npm install
   npm run dev
   ```

8. Open `http://localhost:5173`. The API readiness check is `http://localhost:4000/health/ready`.

## Required environment variable names

`DATABASE_URL`, `POSTGRES_PASSWORD`, `JWT_SECRET`, `TRACKING_TOKEN_SECRET`, `DEMO_ADMIN_EMAIL`, `DEMO_ADMIN_PASSWORD`, `DEMO_KITCHEN_PASSWORD`, `FRONTEND_ORIGIN`, and `VITE_API_BASE_URL`.

Set their values in local environment files. Do not add those values to the repository. `VITE_API_BASE_URL` may use its default when the API is at `http://localhost:4000/api/v1`.

## Reviewer sign-in

These credentials are for the locally seeded review instance only. They are intentionally included here for the reviewer and must not be used for a public production deployment.

| Workspace | Email | Password |
| --- | --- | --- |
| Menu admin | `admin@talesofhyderabad.test` | `Review-Admin-Only-2026!` |
| Kondapur kitchen | `kondapur.kitchen@talesofhyderabad.test` | `Review-Kitchen-Only-2026!` |
| Gachibowli kitchen | `gachibowli.kitchen@talesofhyderabad.test` | `Review-Kitchen-Only-2026!` |
| Kukatpally kitchen | `kukatpally.kitchen@talesofhyderabad.test` | `Review-Kitchen-Only-2026!` |

For a clean local review, use the admin email and passwords above as the values for the matching staff settings before running `npm run db:seed`.

## Seeded review data

The seed adds three active coupons: `WELCOME10` (10% off, ₹200 minimum, ₹100 maximum discount), `HYD75` (₹75 off, ₹499 minimum), and `KONDAPUR20` (20% off at Kondapur, ₹200 minimum, ₹100 maximum discount). One order is included for each outlet so the kitchen boards and admin reports are populated. They are ordinary order records with fictional customer details. Rerunning the seed refreshes these records and coupons without deleting other customer orders.

UPI and card are simulated: the checkout records the selected payment method and creates a successful payment record without collecting payment credentials or contacting a payment provider.

## Reviewer walkthrough

1. Open `http://localhost:5173/login/customer` and continue as a guest. Choose an outlet, browse the menu, add dishes and options, then open the cart. Apply `WELCOME10` or `HYD75` when the cart meets its minimum, choose UPI or card, and place the order. Keep the order tracking link open.
2. In another browser window, open `http://localhost:5173/login/kitchen` and sign in with the matching outlet account above. The new ticket appears on that kitchen board and moves to Preparing as soon as it is accepted. Advance it to Ready, then Rider handoff. The customer's tracking page receives status changes live.
3. Open `http://localhost:5173/login/admin` and sign in as the menu admin. Review the order dashboard, edit menu availability, and manage outlet sales and coupons. The seeded order for each outlet also keeps the boards and reports populated before a new order is placed.

## Data storage and reset behavior

PostgreSQL runs in the `toh-postgres` container and stores application data in the persistent Docker volume `toh-postgres-data`. Restarting the container preserves the database. The seed script is additive except for its own fixed starter records and coupon codes. Do not remove the volume if you need to keep local order data.

## Hosted deployment

No hosted target or production credentials are configured. Before publishing a live instance, use a managed PostgreSQL service, HTTPS, unique production secrets, production staff accounts, a real payment provider integration and a reviewed customer-data retention policy. The repository does not include a deployed application URL.
