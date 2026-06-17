# Golden Hive Apiary — Web Storefront

React + TypeScript e-commerce storefront. Fetches all data (products, site content, testimonials, process steps) from the `services/` Cloudflare Worker backend. Part of the `bee-epic-apiary` monorepo.

## Tech Stack

- **Runtime:** React 19 with TypeScript (strict mode)
- **Build Tool:** Vite 8
- **State Management:** Redux Toolkit
- **Styling:** Tailwind CSS 4
- **Routing:** React Router v7 (BrowserRouter)
- **Payments:** Stripe (redirect checkout via backend API)
- **Contact Form:** Cloudflare Email Service
- **Icons:** Lucide React
- **Animations:** Framer Motion
- **PWA:** vite-plugin-pwa (auto-update service worker)

## Features

- Landing page with sections: Home, About, Process, Products, Testimonials, Contact
- Product grid with category filters (fetched from Stripe via services API)
- Single product detail page
- Shopping cart with localStorage persistence
- Stripe checkout via `POST /checkout` on the services worker
- Contact form sent via Cloudflare Email Service (POST /contact on services worker)
- Responsive mobile-first design

## Getting Started

### Prerequisites

- Node.js 18+
- npm 9+

### Installation

```bash
# From monorepo root
npm install
```

### Environment Variables

Copy `.env.example` to `.env` and configure:

| Variable                      | Description                                 | Default                 |
| ----------------------------- | ------------------------------------------- | ----------------------- |
| `VITE_API_URL`                | Base URL for the services Cloudflare Worker | `http://localhost:8787` |
| `VITE_STRIPE_PUBLISHABLE_KEY` | Stripe publishable key for the client       | —                       |
| `VITE_SITE_URL`               | Site URL for metadata and SEO               | —                       |

### Running

```bash
# From monorepo root (starts services + admin + web concurrently)
npm run dev

# Or just this project
npm run dev --prefix web
```

The site will be available at `http://localhost:5173`.

## Project Structure

```text
web/
├── src/
│   ├── components/
│   │   ├── icons/        # BrandIcons (social media SVGs)
│   │   ├── layout/       # Navbar, Footer, Layout
│   │   ├── pages/        # HomePage, ProductsPage, ProductDetailPage,
│   │   │                 # AboutProcessPage, ContactPage, SuccessPage, CancelPage
│   │   ├── sections/     # HeroSection, AboutSection, ProcessSection,
│   │   │                 # ProductsSection, TestimonialsSection, ContactSection
│   │   ├── shop/         # ProductCard, ProductGrid, CartDrawer, CartItem, CheckoutButton
│   │   └── ui/           # Badge, Button, LoadingSpinner, LocationMap, SectionHeader
│   ├── data/             # Legacy JSON data (no longer imported)
│   ├── hooks/            # useCart, useScrollSpy, useStripeCheckout
│   ├── store/            # Redux store (cartSlice, uiSlice)
│   ├── types/            # TypeScript interfaces (IProduct, ISiteContent, etc.)
│   ├── utils/
│   │   ├── api.ts        # API client (fetchSiteContent, fetchProducts, etc.)
│   │   ├── transform.ts  # Stripe product → IProduct transform
│   │   ├── constants.ts  # App-wide constants
│   │   └── formatters.ts # Price, date, phone formatters
│   └── App.tsx           # Root component (fetches all data on mount)
├── .env                  # Environment variables
├── vite.config.ts        # Vite configuration
├── tailwind.config.ts    # Tailwind CSS configuration
└── .github/              # GitHub Actions deploy workflow
```

## Data Flow

All data is fetched from the `services/` Cloudflare Worker API on app mount:

| Data          | API Endpoint                                | Transform                       |
| ------------- | ------------------------------------------- | ------------------------------- |
| Site content  | `GET /settings/site`                        | None (returned as-is)           |
| Products      | `GET /products?expand[]=data.default_price` | `transformStripeProductsList()` |
| Testimonials  | `GET /settings/testimonials`                | None (returned as-is)           |
| Process steps | `GET /settings/process`                     | None (returned as-is)           |

The worker stores content in Cloudflare KV (`CONTENT_KV`) and products in Stripe. The admin panel (`admin/`) provides CRUD for all of these.

## Updating Content

Content is managed through the admin panel (`admin/`) or directly via the services API:

- **Site content**: `PUT /settings/site` with new `ISiteContent` JSON
- **Products**: Created/updated in Stripe via `POST/PUT /products`
- **Testimonials**: `PUT /settings/testimonials`
- **Process steps**: `PUT /settings/process`

The JSON files in `src/data/` are legacy and no longer imported.

## PWA

The web app is a Progressive Web App using `vite-plugin-pwa` with:

- Auto-update service worker (registers, installs, activates in background)
- Manifest for "Golden Hive Apiary" with app icons
- Offline capability via service worker caching

## Deployment

The web storefront deploys to **Cloudflare Pages**.

### Option A: Git Integration (recommended)

Connect your GitHub repo to Cloudflare Pages in the dashboard:

| Setting                | Value           |
| ---------------------- | --------------- |
| Build command          | `npm run build` |
| Build output directory | `dist`          |
| Root directory         | `web`           |

Environment variables to set: `VITE_API_URL`, `VITE_STRIPE_PUBLISHABLE_KEY`, `VITE_SITE_URL`. Cloudflare Pages auto-deploys on every push to the connected branch.

### Option B: CLI Deploy

```bash
npm run web:deploy
```

Requires `wrangler` to be authenticated (`npx wrangler login`). The `vite.config.ts` base path is set to `"/"` (correct for Cloudflare Pages).

### GitHub Actions

Pushes to `main` or `release` run the `.github/workflows/deploy.yml` workflow, which tests and deploys all projects. Web is deployed to `bee-epic-apiary` Pages project. See the root `README.md` for required secrets.
