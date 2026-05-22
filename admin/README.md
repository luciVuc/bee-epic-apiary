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

- React 18 + TypeScript
- Vite (build tool)
- Redux Toolkit (state management)
- Tailwind CSS (styling) with custom `primary` (yellow/amber) and `dark` (slate) palettes
- React Router v6 (routing)
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

   ```
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

The admin module communicates with the Cloudflare Worker (services) for product management and content settings:

- `GET /products` — List all products with search/category/limit/pagination
- `GET /products/count` — Total product count
- `GET /products/:id` — Get single product
- `POST /products` — Create new product (requires API key)
- `PUT /products/:id` — Update product (requires API key)
- `DELETE /products/:id` — Delete/archive product (requires API key)
- `GET /settings/:type` — Get content settings (site/process/testimonials/categories)
- `PUT /settings/:type` — Save content settings (requires API key)

## Testing

- Framework: Vitest with React Testing Library (jsdom environment)
- Coverage thresholds: 88% lines, 85% branches, 45% functions, 88% statements
- Tests use `data-testid` selectors for element targeting
- Run: `npm run test` or `npm run test:coverage`

## Project Structure

```
admin/
├── src/
│   ├── components/
│   │   ├── forms/          # Section, TextField, TextAreaField
│   │   ├── layout/         # AdminLayout, Sidebar, AdminNavbar
│   │   ├── products/       # ProductFormDialog
│   │   └── shared/         # DeleteConfirmDialog, Spinner
│   ├── pages/
│   │   ├── settings/       # AdminConfigTab, SiteContentTab, ProcessTab,
│   │   │                   # TestimonialsTab, CategoriesTab
│   │   ├── DashboardPage.tsx
│   │   ├── ProductsPage.tsx
│   │   ├── ProductDetailPage.tsx
│   │   └── SettingsPage.tsx
│   ├── store/              # Redux store + productsSlice
│   ├── types/              # IProduct, ISiteContent, IStripe*, etc.
│   ├── utils/              # API client, transform, badgeClasses, constants
│   └── test/               # Test setup
├── public/                 # Static assets
├── index.html
├── vite.config.ts
├── vitest.config.ts
├── tailwind.config.ts
└── package.json
```

## Notes

- Runs on port 5174 by default
- API requests are proxied to the Cloudflare Worker during development (Vite proxy rewrites `/api` -> `/`)
- Settings storage: Admin config saved to localStorage; site content saved to worker KV
- Product CRUD creates both a Stripe product and a Stripe price, with rollback on failure
