# GSTMitra

GSTMitra is a GST bookkeeping and return-preparation web app for Indian businesses. It brings sales invoices, purchase bills, tax summaries, and GST return preparation together in one interface.

> GSTMitra is a bookkeeping and return-preparation tool. Review your records and filings with a qualified tax professional before submitting them.

## Features

- Business onboarding and account-based access
- Customer, vendor, and goods/services catalog management
- Sales invoice creation with automatic intra-state CGST/SGST and inter-state IGST calculations
- Invoice PDF downloads
- Purchase bill recording, payment tracking, and input tax credit summaries
- GST filing workspace with GSTR-1, GSTR-3B, and books-to-GSTR-2B reconciliation summaries and exports
- GST rules and rates reference, filing checks, and GST glossary/guidance

## Tech stack

- **Frontend:** Next.js, React, TypeScript, Tailwind CSS
- **Backend:** Node.js, Express, TypeScript
- **Database:** PostgreSQL
- **ORM:** Prisma

## Project structure

```text
.
├── Backend/        # Express API, Prisma schema, migrations, and seed script
└── frontend/       # Next.js web application
```

## Requirements

- Node.js and npm
- PostgreSQL database

## Local development

### 1. Configure the environment

Create a `.env` file in the repository root. Keep it private; `.env` files are ignored by Git.

```dotenv
# PostgreSQL connection used by Prisma CLI and as the backend fallback
DATABASE_URL="postgresql://USER:PASSWORD@HOST:5432/DATABASE?schema=public"

# Optional: pooled PostgreSQL connection used by the backend at runtime
DATABASE_URL_POOLED="postgresql://USER:PASSWORD@HOST:5432/DATABASE?schema=public"

# Required for signing authentication tokens
JWT_SECRET="replace-with-a-long-random-secret"

# Optional: backend port (defaults to 4000)
PORT=4000
```

If `DATABASE_URL_POOLED` is not set, the backend uses `DATABASE_URL`.

To point the frontend at a backend other than `http://localhost:4000/api`, create `frontend/.env.local`:

```dotenv
NEXT_PUBLIC_API_URL="http://localhost:4000/api"
```

### 2. Install dependencies

In separate terminals:

```bash
cd Backend
npm install
```

```bash
cd frontend
npm install
```

### 3. Set up the database

From the `Backend` directory, apply the committed Prisma migrations and generate the Prisma client:

```bash
npx prisma migrate deploy
npx prisma generate
```

Optionally, load the development seed data:

```bash
npm run db:seed
```

### 4. Start the app

Run the API from the `Backend` directory:

```bash
npm run dev
```

Run the web app from the `frontend` directory:

```bash
npm run dev
```

The frontend is available at [http://localhost:3000](http://localhost:3000) and the API defaults to [http://localhost:4000](http://localhost:4000). The API health endpoint is `GET /health`.

## Useful commands

Run these from the relevant workspace:

| Workspace | Command | Purpose |
| --- | --- | --- |
| `Backend/` | `npm run dev` | Start the API in watch mode |
| `Backend/` | `npm start` | Start the API |
| `Backend/` | `npm run db:seed` | Run the seed script |
| `Backend/` | `npx prisma migrate deploy` | Apply database migrations |
| `Backend/` | `npx prisma generate` | Generate the Prisma client |
| `Backend/` | `npx tsc --noEmit` | Type-check the backend |
| `frontend/` | `npm run dev` | Start the Next.js development server |
| `frontend/` | `npm run build` | Generate the Prisma client and build the frontend |
| `frontend/` | `npm start` | Start the production frontend server |
| `frontend/` | `npm run lint` | Run ESLint |
| `frontend/` | `npx tsc --noEmit` | Type-check the frontend |

## API overview

The backend mounts its API under `/api`:

| Prefix | Purpose |
| --- | --- |
| `/api/auth` | Sign-up, login, user profile, and business onboarding |
| `/api/items` | Goods and services catalog |
| `/api/customers` | Customer records |
| `/api/vendors` | Vendor records |
| `/api/sales` | Sales invoices, invoice PDFs, and credit/debit notes |
| `/api/purchases` | Purchase bills, payments, and expense summaries |
| `/api/filing` | GST return summaries, exports, and reconciliation |
| `/api/health-check` | Month-based sales and purchase checks for the signed-in business |
| `/api/rules` | GST rules and audit logs |

Most API routes require authentication.

The separate `GET /health` endpoint only reports whether the backend process is responding. The authenticated `GET /api/health-check?month=YYYY-MM&scope=all|sales|purchase` endpoint checks the signed-in business's saved invoice and bill data for the selected month.

## Notes

- The backend and frontend are separate npm workspaces; install dependencies and run commands from the appropriate directory.
- Never commit database connection strings, authentication secrets, or other credentials.
- Check the current GST rules and portal requirements before relying on generated summaries or filing exports.
