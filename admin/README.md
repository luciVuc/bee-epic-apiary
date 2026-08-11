# Bee Epic Apiary - Admin Module

Admin panel for managing products and settings for the Bee Epic Apiary e-commerce platform.

## Features

- **Dashboard**: Overview of products, statistics, category breakdown bars, quick actions, and recent products
- **Products Management**: List, search, filter by category, add, edit, and delete products
  - Desktop table view / mobile card view
  - "Load More" pagination
  - Search with debounced input
  - Category filter dropdown
  - Empty state for no results
- **Product Detail**: View product images, description, tags, status, Stripe integration details
- **Product Form** (modal dialog): Add/edit with fields for name, slug, description, price (cents), category, weight, stock, featured status, image URLs, thumbnail URLs, tags, Stripe payment link, subscription interval support
- **Settings**: Tabbed interface (5 tabs):
  - Admin Config: API URL, Stripe publishable key
  - Site Content: Business info, hero section, about section, section titles, stats bar, nav links, social links, order confirmation
  - Process: "From Hive to Table" process steps
  - Testimonials: Customer testimonials with star ratings
  - Categories: Product category management

## Tech Stack

- React 19 + TypeScript
- Vite (build tool)
- Redux Toolkit (state management)
- Tailwind CSS 4 (styling) with custom `primary` (yellow/amber) and `dark` (slate) palettes
- React Router v7 (routing, BrowserRouter)
- Axios (API calls)
- Lucide React (icons)
- Vitest + React Testing Library (tests)

## Auth (cookie session)

The admin panel uses a cookie-based session. On successful login the server
issues a `bea_at` HttpOnly HS256 JWT cookie (1-hour TTL, `SameSite=Lax`,
signed with `JWT_SIGNING_SECRET`). The browser forwards it automatically on
every subsequent request; axios is configured with `withCredentials: true` so
the cookie rides along on every API call — including the SSE connection
(`new EventSource(url, { withCredentials: true })` in `AdminNavbar.tsx`).

The login endpoint is `POST /auth/login`. On first deploy, `GET /whoami`
returns `bootstrapAvailable: true`; the SPA redirects to `/bootstrap` where
the initial OWNER account is created via an email-invite flow. After that,
`bootstrapAvailable: false` and the standard login page is used.

Roles: `OWNER > MANAGER > EMPLOYEE > VENDOR` (from `EStaffRole`).

- User accounts are managed in **Settings → Users** tab (OWNER only), wired to `/users/*`.
- Password policy is managed in **Settings → Security** tab (OWNER only), wired to `/settings/auth-policy`.

**Local development** uses the same login flow as production. For scripted
tests (curl / Playwright), the worker honors `X-Dev-Email` only when
`ENVIRONMENT=development` — but the admin SPA no longer sends it; you sign in
through the login page like production.

**CI / scripts** can still send `Authorization: Bearer <API_SECRET_KEY>` for
service-to-service automation. This bearer is NEVER bundled with the admin
client.

### Cookie scope (VITE_API_URL ⇄ admin Pages site)

`bea_at` is a host-scoped cookie. For it to ride along on API requests,
`VITE_API_URL` MUST resolve to a hostname that shares the **eTLD+1** with the
admin Pages site (e.g. `admin.example.com` ↔ `api.example.com`).
Cross-apex setups (`admin.example.com` ↔ `api.other.com`) won't forward the
cookie and every authenticated call will mysteriously 401.

The admin bundle warns in the browser console at boot when the configured
`VITE_API_URL` hostname doesn't appear to share the page eTLD+1 (review I1).
Path-relative URLs (`VITE_API_URL=/api`) bypass the check — they always share
the page origin.

## Getting Started

### Prerequisites

- Node.js 18+
- Cloudflare Worker running on port 8787 (for API)

### Installation

1. Install dependencies:

   ```bash
   cd admin
   npm install
   ```

2. Create `.env` file:

   ```bash
   cp .env.example .env
   ```

3. Update `.env` with your configuration:

   ```bash
   VITE_API_URL=http://localhost:8787
   VITE_STRIPE_PUBLISHABLE_KEY=pk_test_...
   ```

4. Start development server:

   ```bash
   npm run dev
   ```

   The admin panel will be available at `http://localhost:5174`

## Available Scripts

| Command                 | Purpose                           |
| ----------------------- | --------------------------------- |
| `npm run dev`           | Start development server (Vite)   |
| `npm run build`         | Build for production (tsc + vite) |
| `npm run preview`       | Preview production build          |
| `npm run lint`          | Run ESLint                        |
| `npm run format`        | Format code with Prettier         |
| `npm run test`          | Run Vitest tests                  |
| `npm run test:watch`    | Run tests in watch mode           |
| `npm run test:coverage` | Run tests with coverage           |

## API Integration

The admin module communicates with the Cloudflare Worker (services) for product management, orders, and content settings. Each endpoint is gated by a minimum staff role (see Auth section above):

| Endpoint                                               | Method    | Required role                    |
| ------------------------------------------------------ | --------- | -------------------------------- |
| `GET /products`                                        | GET       | public                           |
| `GET /products/count`                                  | GET       | public                           |
| `GET /products/stats`                                  | GET       | EMPLOYEE                         |
| `GET /products/:id`                                    | GET       | public                           |
| `POST /products`                                       | POST      | MANAGER                          |
| `PUT /products/:id`                                    | PUT       | MANAGER                          |
| `DELETE /products/:id`                                 | DELETE    | MANAGER                          |
| `POST /prices`                                         | POST      | MANAGER                          |
| `GET /orders`                                          | GET       | EMPLOYEE                         |
| `GET /orders/:id`                                      | GET       | EMPLOYEE                         |
| `PUT /orders/:id`                                      | PUT       | EMPLOYEE                         |
| `POST /checkout`                                       | POST      | public                           |
| `GET /settings/:type`                                  | GET       | public                           |
| `PUT /settings/{site,process,testimonials,categories}` | PUT       | MANAGER                          |
| `GET /settings/auth-policy`                            | GET       | VENDOR (any authenticated staff) |
| `PUT /settings/auth-policy`                            | PUT       | OWNER                            |
| `GET /whoami`                                          | GET       | public                           |
| `GET /notifications/stream`                            | GET (SSE) | EMPLOYEE                         |
| `POST /contact`                                        | POST      | public                           |
| `GET /users`                                           | GET       | OWNER                            |
| `POST /users/invite`                                   | POST      | OWNER                            |
| `DELETE /users/:email`                                 | DELETE    | OWNER                            |
| `POST /auth/login`                                     | POST      | public                           |
| `POST /auth/logout`                                    | POST      | public                           |
| `POST /auth/bootstrap-owner`                           | POST      | public                           |

## Testing

- Framework: Vitest with React Testing Library (jsdom environment)
- Coverage thresholds (ratchet baseline; raise as new tests land):
  - 80% lines, 67% branches, 75% functions, 78% statements
  - The previous nominal 88/85/45/88 numbers were never met and silently failed every coverage run; thresholds now reflect actuals (review I8). Functions bumped 45 → 75 in the same pass.
- Tests use `data-testid` selectors for element targeting
- Run: `npm run test` or `npm run test:coverage`

## Project Structure

```text
admin/
├── src/
│   ├── components/
│   │   ├── forms/          # Section, TextField, TextAreaField
│   │   ├── layout/         # AdminLayout, Sidebar, AdminNavbar
│   │   ├── notifications/  # NotificationsPanel (SSE stream)
│   │   ├── products/       # ProductFormDialog
│   │   └── shared/         # DeleteConfirmDialog, Spinner
│   ├── pages/
│   │   ├── settings/       # AdminConfigTab, SiteContentTab, ProcessTab,
│   │   │                   # TestimonialsTab, CategoriesTab
│   │   ├── DashboardPage.tsx
│   │   ├── ProductsPage.tsx
│   │   ├── ProductDetailPage.tsx
│   │   ├── OrdersPage.tsx
│   │   ├── OrderDetailPage.tsx
│   │   └── SettingsPage.tsx
│   ├── store/              # Redux store + productsSlice + ordersSlice
│   ├── types/              # IProduct, IOrder, ISiteContent, IStripe*, etc.
│   ├── utils/              # API client, transform, badgeClasses, constants
│   └── test/               # Test setup
├── public/                 # Static assets
├── index.html
├── vite.config.ts
├── vitest.config.ts
├── tailwind.config.ts
└── package.json
```

## Deployment

The admin panel deploys to **Cloudflare Pages**.

### Git Integration (recommended)

Connect your GitHub repo to Cloudflare Pages in the dashboard:

| Setting                | Value           |
| ---------------------- | --------------- |
| Build command          | `npm run build` |
| Build output directory | `dist`          |
| Root directory         | `admin`         |

Environment variables: `VITE_API_URL`, `VITE_STRIPE_PUBLISHABLE_KEY`. `VITE_API_SECRET_KEY` has been removed as of Plan 3 — the admin panel no longer bakes any secret into its bundle.

**Auth model**: The admin panel ships its own login page (`/login`). On successful `POST /auth/login` the server issues a `bea_at` HttpOnly cookie; subsequent requests (and the SSE stream) carry it automatically because axios uses `withCredentials: true`. Staff roles (`OWNER > MANAGER > EMPLOYEE > VENDOR`) are managed in **Settings → Users** tab (OWNER only). Password policy is managed in **Settings → Security** tab (OWNER only).

### CLI Deploy

```bash
npm run admin:deploy
```

(Requires `npx wrangler login`.)

### GitHub Actions

Pushes to `main` or `release` run the `.github/workflows/deploy.yml` workflow, which tests and deploys all projects. Admin is deployed to `bee-epic-apiary-admin` Pages project. See the root `README.md` for required secrets.

## Notes

- Runs on port 5174 by default
- API requests are proxied to the Cloudflare Worker during development (Vite proxy rewrites `/api` -> `/`)
- Settings storage:
  - Admin config (API URL) comes from a Vite build-time env var (`VITE_API_URL`)
  - Site content / process / testimonials / categories saved to worker KV via API
  - **Users** managed via Settings → Users tab (OWNER only), wired to `/users/*`
  - **Password policy** managed via Settings → Security tab (OWNER only), wired to `/settings/auth-policy`
- Auth in local dev: sign in through `/login` as in production. For scripted tests (curl / Playwright), pass `X-Dev-Email` directly to the worker — it is honored only when `ENVIRONMENT=development`. The admin SPA does not send `X-Dev-Email`.
- Product CRUD creates both a Stripe product and a Stripe price, with rollback on failure
