# Brightloop

Brightloop is an admin-only product and quotation-template management app. It includes a React/Vite admin interface and an Express API backed by PostgreSQL and Prisma.

## Requirements

- Node.js 20+
- PostgreSQL 14+
- npm

## Setup

1. Install all workspace dependencies from the repository root:

   ```sh
   npm install
   ```

   (If installing packages individually, use `npm install --prefix client` and `npm install --prefix server`.)

2. Configure the API in `server/.env` (copy `server/.env.example`):

   ```env
   DATABASE_URL="postgresql://postgres:password@localhost:5432/brightloop?schema=public"
   JWT_SECRET="replace-with-a-long-random-secret"
   JWT_EXPIRES_IN="8h"
   CLIENT_ORIGIN="http://localhost:5173"
   PORT=4000
   ```

3. Configure the client in `client/.env` (copy `client/.env.example`):

   ```env
   VITE_API_URL="http://localhost:4000/api"
   ```

4. Create the database tables and seed the admin, tax rates, demo products, plans, and quotation templates:

   ```sh
   npm run db:migrate
   npm run db:seed
   ```

   The seeded local admin is `admin@brightloop.com` / `Admin@1234`. Change the password before using this outside local development.

5. Start both applications:

   ```sh
   npm run dev
   ```

   Open `http://localhost:5173`. The API listens on `http://localhost:4000`.

## Useful commands

- `npm run dev` — client and API in development mode
- `npm run build` — build the React client
- `npm run server` — start the API with Node
- `npm run db:migrate` — apply Prisma migrations
- `npm run db:seed` — idempotently create/update the admin, GST 18% / GST 12% / No Tax, demo catalog, and three quotation templates

## Admin API

`POST /api/auth/login` is the only public API route. Products, taxes, and quotation-template routes require a valid admin JWT. Responses use `{ success, data, message, meta, warnings }` as applicable. Product listing supports server-side filtering, sorting, and pagination.

Products referenced by a subscription or quotation template cannot be deleted; archive them instead. Product create/update, variant/plan replacement, and quotation-template creation use database transactions.

The Templates page lists the seeded quotation examples and supports creating, editing, and deleting templates. The theme button in the top navigation switches between light and dark mode; the choice is saved in `localStorage` under `brightloop-theme`.

## Included scope

The app implements the admin login, product list and editor, product variants and plans, bulk actions, duplication, archive/delete safeguards, taxes, quotation templates, and a lightweight dashboard overview. It does not include customer/staff pages, invoices, payments, or reports.
