# Bee Epic Apiary - Admin Module

Admin panel for managing products and settings for the Bee Epic Apiary e-commerce platform.

## Features

- **Dashboard**: Overview of products, statistics, and quick actions
- **Products Management**: List, search, filter, add, edit, and delete products
- **Settings**: Configure business information, Stripe keys, and API settings

## Tech Stack

- React 18 + TypeScript
- Vite (build tool)
- Redux Toolkit (state management)
- Tailwind CSS (styling)
- React Router v6 (routing)
- Axios (API calls)
- Lucide React (icons)

## Getting Started

### Prerequisites

- Node.js 18+
- Cloudflare Worker running (for API)

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
   VITE_API_SECRET_KEY=your_api_secret_key
   VITE_STRIPE_PUBLISHABLE_KEY=pk_test_...
   VITE_ALLOWED_ORIGINS=http://localhost:5173,http://localhost:5174
   ```

4. Start development server:

   ```bash
   npm run dev
   ```

   The admin panel will be available at `http://localhost:5174`

## Available Scripts

| Command           | Purpose                   |
| ----------------- | ------------------------- |
| `npm run dev`     | Start development server  |
| `npm run build`   | Build for production      |
| `npm run preview` | Preview production build  |
| `npm run lint`    | Run ESLint                |
| `npm run format`  | Format code with Prettier |

## Usage

### Dashboard

The dashboard provides:

- Total products count
- In stock products count
- Featured products count
- Category breakdown with visual bars
- Quick links to manage products and settings
- Recent products list

### Products Management

- **List View**: View all products with search and category filtering
- **Add Product**: Click "Add Product" button to open the product form
- **Edit Product**: Click the edit icon or click on a product to view details, then click "Edit"
- **Delete Product**: Click the delete icon and confirm deletion
- **Search**: Use the search bar to filter products by name or description
- **Filter**: Use the category dropdown to filter by product category

### Product Form

The product form (used for both add and edit) includes fields for:

- Product name and slug
- Short and long descriptions
- Price (in cents)
- Category selection
- Stock status and featured status
- Image URLs and thumbnail URLs
- Tags

### Settings

Configure:

- Business information (name, email, phone, location)
- Stripe configuration (publishable key, secret key reference)
- API configuration (API URL, allowed origins for CORS)

Settings are saved to localStorage.

## API Integration

The admin module communicates with the Cloudflare Worker (services) for product management:

- `GET /products` - List all products
- `GET /products/:id` - Get single product
- `POST /products` - Create new product (requires API key)
- `PUT /products/:id` - Update product (requires API key)
- `DELETE /products/:id` - Delete product (requires API key)

## Structure

```
admin/
├── src/
│   ├── components/
│   │   ├── layout/       # AdminLayout, Sidebar, Navbar
│   │   └── products/     # ProductFormDialog
│   ├── pages/            # DashboardPage, ProductsPage, ProductDetailPage, SettingsPage
│   ├── store/            # Redux store and productsSlice
│   ├── types/            # TypeScript types
│   └── utils/            # API client and constants
├── public/              # Static assets
└── package.json
```

## Notes

- The admin module runs on port 5174 by default
- API requests are proxied to the Cloudflare Worker during development
- Product images are served from the web app's image directory
- Settings are stored in browser localStorage (not in the Cloudflare Worker)
