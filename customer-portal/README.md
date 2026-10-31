# Brightloop Software Customer Portal

A complete customer-facing subscription portal built with React, Vite, Tailwind CSS, Express, JWT, and SQLite. Customers can view and manage their own profile, plans, subscriptions, invoices, payments, renewal requests, and support tickets.

## Requirements

- Node.js 20 or newer
- npm 10 or newer

## Run locally

1. Install packages:

   ```sh
   npm install
   ```

2. Copy `.env.example` to `.env` and set `JWT_SECRET` to a long, random value. For a quick local demo, the API has a development-only fallback secret; never use that fallback in production.

3. Create the SQLite database and demo records:

   ```sh
   npm run seed
   ```

4. Start the API and Vite frontend together:

   ```sh
   npm run dev
   ```

5. Open `http://localhost:5173`.

Demo login: `demo@brightloop.com` / `DemoPass!123`.

The frontend proxies `/api` requests to the Express API at `http://localhost:4000`. For production, build the frontend with `npm run build`, set `APP_URL` to the portal origin, configure a production `JWT_SECRET` and SMTP credentials, and run `npm start` for the API. Serve the generated `dist/` directory from a static host or reverse proxy.

## Password reset email

Set `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, and `SMTP_FROM` to send reset email through Nodemailer. Without SMTP configured, development prints the one-hour reset link in the API console. Reset tokens are random, stored as SHA-256 hashes, single-use, and expire after one hour. Unknown emails receive the same response as registered emails.

## Database and seed data

SQLite is stored at `DATABASE_FILE` (default `./data/brightloop.sqlite`). The runtime schema is initialized by `server/db.js`; the SQL schema is also available in `server/schema.sql`. `npm run seed` is idempotent for the demo email and creates one demo customer, three plans, two subscriptions, five invoices with paid/confirmed/overdue statuses, and four payments. The seed includes a closed non-renewable plan to exercise renewal restrictions.

The required schema includes `users`, `customers`, `products`, `product_variants`, `plans`, `subscriptions`, `subscription_lines`, `invoices`, `invoice_lines`, `payments`, `discounts`, `taxes`, `renewal_requests`, `support_tickets`, and `password_reset_tokens`. Indexed customer/date access paths support the list pages.

## REST API

Customer endpoints are under `/api/customer`. Signup, login, forgot password, and reset password are public. All profile and business-data routes require a customer JWT. The API includes profile read/update/password change, dashboard, date-valid plans and plan requests, subscription list/detail, filtered and paginated invoices/detail/PDF, filtered payments, renewal request/list, and support ticket create/list.

## Security model

- Private routes accept only a verified JWT with `role: customer` and a numeric customer ID.
- Resource ownership always comes from `req.customerId`, which is populated from JWT claims. Query/body customer IDs are not used to select private data.
- Invoice and subscription detail, including PDF downloads, combine the resource ID with the authenticated customer ID. Another customer's resource returns 404.
- Payments, dashboard, support tickets, renewals, profile, and subscriptions are selected by authenticated customer ownership.
- Customer endpoints do not expose plan, tax, discount, invoice status, payment status, or staff-management mutations.
- Inputs are validated server-side; signup/login/reset endpoints are rate limited; HTTP security headers are enabled.

## Security test checklist

Run the automated isolation test suite:

```sh
npm test
```

`server/security.test.js` creates two isolated customer accounts and verifies:

- Customer A receives 404 for Customer B's subscription detail.
- Customer A receives 404 for Customer B's invoice detail and PDF.
- Customer A's invoice, payment, renewal, and support-ticket lists do not contain Customer B's records.
- Supplying a `customerId` query parameter cannot change the customer scope derived from the JWT.
- A signed JWT with an admin role is denied access to customer-only routes.

Manual smoke checklist:

- Sign in as the demo account and verify the Dashboard, subscriptions, invoices, and payments load.
- Copy an invoice or subscription ID from the database, create another customer, and request the other customer's resource with that second customer's token; expect 404.
- Attempt the same cross-customer access to `/invoices/:id/pdf`; expect 404 and no PDF body.
- Change the `customerId` query string on list routes; response must remain scoped to the logged-in account.
- Try a non-customer role token; expect 403.
- Confirm unauthenticated access to private routes returns 401 and the frontend redirects to login.
- Test duplicate signup email, invalid password rules, expired/used reset token, and unavailable/closed plan renewal.

## Commands

- `npm run dev` starts the Vite frontend and Express API.
- `npm run dev:web` starts only Vite.
- `npm run dev:api` starts the API with Node watch mode.
- `npm run seed` inserts demo records once.
- `npm test` runs API security tests.
- `npm run build` creates the optimized frontend bundle.
- `npm start` starts the API in production mode.