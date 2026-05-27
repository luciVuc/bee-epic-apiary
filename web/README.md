# Golden Hive Apiary — Web Storefront

React + TypeScript e-commerce storefront. Fetches all data (products, site content, testimonials, process steps) from the `services/` Cloudflare Worker backend. Part of the `bee-epic-apiary` monorepo.

## Tech Stack

- **Runtime:** React 18 with TypeScript (strict mode)
- **Build Tool:** Vite
- **State Management:** Redux Toolkit
- **Styling:** Tailwind CSS v3
- **Routing:** React Router v6 (Hash Router)
- **Payments:** Stripe (redirect checkout via backend API)
- **Contact Form:** Formspree
- **Icons:** Lucide React
- **Animations:** Framer Motion

## Features

- Landing page with sections: Home, About, Process, Products, Testimonials, Contact
- Product grid with category filters (fetched from Stripe via services API)
- Single product detail page
- Shopping cart with localStorage persistence
- Stripe checkout via `POST /checkout` on the services worker
- Contact form with Formspree (form ID configured via admin settings API)
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

### Running

```bash
# From monorepo root (starts services + admin + web concurrently)
npm run dev

# Or just this project
npm run dev --prefix web
```

The site will be available at `http://localhost:5173`.

## Project Structure

```
web/
├── public/images/products/   # Product images
├── src/
│   ├── components/
│   │   ├── layout/       # Navbar, Footer, Layout
│   │   ├── pages/        # Route-level page components
│   │   ├── sections/     # Page sections (Hero, About, etc.)
│   │   ├── shop/         # Product cards, Cart, Checkout
│   │   └── ui/           # Reusable UI (Button, Badge, etc.)
│   ├── data/             # Legacy JSON data (no longer imported)
│   ├── hooks/            # Custom React hooks
│   ├── store/            # Redux store (cart, UI state)
│   ├── types/            # TypeScript interfaces
│   ├── utils/
│   │   ├── api.ts        # API client (fetchSiteContent, fetchProducts, etc.)
│   │   ├── transform.ts  # Stripe product → IProduct transform
│   │   ├── constants.ts  # App-wide constants
│   │   └── formatters.ts # Price, date, phone formatters
│   └── App.tsx           # Root component (fetches all data on mount)
├── .env                  # Environment variables
├── vite.config.ts        # Vite configuration
└── tailwind.config.ts    # Tailwind CSS configuration
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

## Deployment

### Build

```bash
npm run build
```

Output goes to `dist/`. The `vite.config.ts` base path is set to `"/"`.

### GitHub Pages

For GitHub Pages deployment with a repo name different from the apex domain, update `base` in `vite.config.ts` to `/<repo-name>/`.
