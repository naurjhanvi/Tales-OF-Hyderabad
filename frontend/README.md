# Tales of Hyderabad web application

The React application provides the customer ordering journey, role-specific staff sign-in, kitchen operations and menu administration. The backend owns menus, outlet availability, coupon rules, order totals, payments and order status history. The customer cart and private order tracking token remain in the current browser.

## Run locally

Start PostgreSQL and the API using `../README.md`, then start the web application:

```powershell
cd frontend
npm install
Copy-Item .env.example .env.local
npm run dev
```

Open `http://localhost:5173`. Set `VITE_API_BASE_URL` in `.env.local` only when the API is not available at `http://localhost:4000/api/v1`.

## Main flows

- Start at `/` and choose a workspace.
- Customer: continue as a guest, choose an outlet at `/customer`, browse and customize the API menu, apply a coupon in the cart, choose UPI or card, place the order and follow its status.
- Kitchen: sign in at `/login/kitchen`, review the assigned outlet's orders and advance each order through the permitted status sequence.
- Menu admin: sign in at `/login/admin`, manage menu items and per-outlet availability, configure item sales and coupons, and review business activity.
- `/staff-login` redirects to the workspace chooser.

Payment methods are recorded with orders through a simulated checkout flow. No card or UPI credentials are requested or sent to the API.
