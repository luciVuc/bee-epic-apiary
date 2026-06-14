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
  - Admin Config: API URL, API secret key, Stripe publishable key
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
   VITE_API_SECRET_KEY=dev-api-key-change-me
   VITE_STRIPE_PUBLISHABLE_KEY=pk_test_...
   VITE_ALLOWED_ORIGINS=http://localhost:5173,http://localhost:5174
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

The admin module communicates with the Cloudflare Worker (services) for product management, orders, and content settings:

- `GET /products` — List all products with search/category/limit/pagination
- `GET /products/count` — Total product count
- `GET /products/:id` — Get single product
- `POST /products` — Create new product (requires API key)
- `PUT /products/:id` — Update product (requires API key)
- `DELETE /products/:id` — Delete/archive product (requires API key)
- `GET /orders` — List orders with search/status/payment filters
- `GET /orders/:id` — Get single order with line items
- `PUT /orders/:id` — Update order metadata/delivery info (requires API key)
- `POST /checkout` — Create Stripe checkout sessions (public)
- `GET /settings/:type` — Get content settings (site/process/testimonials/categories)
- `PUT /settings/:type` — Save content settings (requires API key)
- `GET /notifications/stream` — SSE stream for real-time order notifications

## Testing

- Framework: Vitest with React Testing Library (jsdom environment)
- Coverage thresholds: 88% lines, 85% branches, 45% functions, 88% statements
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

Environment variables: `VITE_API_URL`, `VITE_STRIPE_PUBLISHABLE_KEY`, `VITE_API_SECRET_KEY`.

**Important**: The admin panel has no login page — it relies on the bearer token from `VITE_API_SECRET_KEY`. Consider putting **Cloudflare Access** in front of the Pages site for an authentication layer.

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
- Settings storage: Admin config saved to localStorage; site content saved to worker KV
- Product CRUD creates both a Stripe product and a Stripe price, with rollback on failure
