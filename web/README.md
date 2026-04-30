# Golden Hive Apiary

A beautiful React + TypeScript e-commerce website and marketing site for a small beekeeping business. Built with Vite, Redux Toolkit, Tailwind CSS, and deployed to GitHub Pages.

![Golden Hive Apiary Screenshot](https://via.placeholder.com/1200x630.png?text=Golden+Hive+Apiary)

## Tech Stack

- **Runtime:** React 18 with TypeScript (strict mode)
- **Build Tool:** Vite
- **State Management:** Redux Toolkit
- **Styling:** Tailwind CSS v3
- **Routing:** React Router v6 (Hash Router for GitHub Pages)
- **Payments:** Stripe (Client-only redirect checkout)
- **Contact Form:** Formspree
- **Icons:** Lucide React
- **Animations:** Framer Motion

## Features

- Single-page scrolling website with sections: Home, About, Process, Products, Testimonials, Contact
- E-commerce product grid with category filters
- Shopping cart with localStorage persistence
- Stripe checkout integration (client-only)
- Contact form with Formspree
- Responsive mobile-first design
- Smooth animations with Framer Motion

## Getting Started

### Prerequisites

- Node.js 18+
- npm 9+

### Installation

1. Clone the repository:

```bash
git clone https://github.com/lucivuc/golden-hive-apiary.git
cd golden-hive-apiary
```

2. Install dependencies:

```bash
npm install
```

3. Copy the environment file:

```bash
cp .env.example .env
```

4. Start development server:

```bash
npm run dev
```

The site will be available at `http://localhost:5173`

## Configuration

### Stripe Setup

To enable Stripe checkout, follow these steps:

1. Create a [Stripe account](https://stripe.com) if you don't have one

2. Go to Stripe Dashboard → Products and create products for each item you want to sell:
   - Wildflower Raw Honey
   - Clover Blossom Honey
   - Buckwheat Dark Honey
   - Beeswax Lip Balm Set
   - Hand-Rolled Beeswax Candles
   - Honey Lover's Gift Set
   - Premium Hive Collection
   - Monthly Honey Club

3. For each product, copy the Price ID (starts with `price_...`)

4. Update `src/data/products.json` with your Stripe Price IDs:

```json
{
  "stripePriceId": "price_1234567890abcdef"
}
```

5. Get your Stripe Publishable Key from [Stripe Dashboard → Developers → API Keys](https://dashboard.stripe.com/test/apikeys)

6. Add to your `.env` file:

```
VITE_STRIPE_PUBLISHABLE_KEY=pk_test_xxxxxxxxxxxxxx
```

### Formspree Setup

To enable the contact form:

1. Create a [Formspree account](https://formspree.io)

2. Create a new form and get your Form ID

3. Add to your `.env` file:

```
VITE_FORMSPREE_FORM_ID=your_form_id
```

### Site URL

Update the site URL in your `.env` file for proper redirect URLs:

```
VITE_SITE_URL=https://lucivuc.github.io/golden-hive-apiary
```

## Project Structure

```
golden-hive-apiary/
├── public/
│   └── images/
│       └── products/          # Product images
├── src/
│   ├── components/
│   │   ├── layout/       # Navbar, Footer, Layout
│   │   ├── sections/     # Page sections
│   │   ├── shop/        # Product cards, Cart
│   │   └── ui/          # Reusable UI components
│   ├── data/            # JSON data files
│   ├── hooks/           # Custom React hooks
│   ├── store/           # Redux store
│   ├── types/           # TypeScript types
│   ├── utils/           # Utility functions
│   └── App.tsx          # Main app component
├── .env.example         # Environment variables template
├── tailwind.config.ts  # Tailwind config
└── vite.config.ts       # Vite config
```

## Updating Content

### Adding/Editing Products

Edit `src/data/products.json`:

```json
{
  "id": "unique-product-id",
  "name": "Product Name",
  "slug": "product-slug",
  "description": "Short description",
  "longDescription": "Detailed description",
  "price": 1200, // In cents ($12.00)
  "stripePriceId": "price_...",
  "category": "honey", // honey | beeswax | gifts | subscriptions
  "imageUrls": ["/images/products/product.jpg"],
  "thumbnailUrls": ["/images/products/product-thumb.jpg"],
  "inStock": true,
  "featured": false,
  "weight": "12 oz",
  "tags": ["raw", "natural"]
}
```

### Updating Site Content

Edit `src/data/site.json` to update business name, tagline, contact info, etc.

### Adding Testimonials

Edit `src/data/testimonials.json`:

```json
{
  "id": "testimonial-6",
  "name": "Customer Name",
  "location": "City, State",
  "rating": 5,
  "text": "Testimonial text...",
  "date": "2024-01-15"
}
```

### Updating Process Steps

Edit `src/data/process.json` to update the honey-making process description.

## Deployment

### GitHub Pages

The project is configured for GitHub Pages deployment using GitHub Actions.

1. Push to main branch:

```bash
git add .
git commit -m "Initial commit"
git push origin main
```

2. GitHub Actions will automatically build and deploy

The site will be available at: `https://lucivuc.github.io/golden-hive-apiary/`

### Note on Base Path

The `vite.config.ts` is configured with `base: '/golden-hive-apiary/'`. If you rename your repository, update this path.

## License

MIT License - See [LICENSE](LICENSE) for details.

## Acknowledgments

- Built with [Vite](https://vitejs.dev)
- Icons by [Lucide](https://lucide.dev)
