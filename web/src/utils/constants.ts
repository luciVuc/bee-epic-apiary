export const DEFAULT_LOGO = `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Ctext x='50' y='80' font-size='80' text-anchor='middle'%3E%F0%9F%90%9D%3C/text%3E%3C/svg%3E`;

export const DEFAULT_API_URL =
  import.meta.env.VITE_API_URL ||
  (import.meta.env.PROD ? "" : "http://localhost:8787");
export const SITE_URL =
  import.meta.env.VITE_SITE_URL || "http://localhost:5173";
export const STRIPE_PUBLISHABLE_KEY =
  import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY || "";

export const PRODUCTS_PER_PAGE = 12;

export const CATEGORIES = [
  { id: "ALL", label: "All Products" },
  { id: "HONEY", label: "Honey" },
  { id: "BEESWAX", label: "Beeswax" },
  { id: "GIFTS", label: "Gift Sets" },
  { id: "SUBSCRIPTIONS", label: "Subscriptions" },
] as const;

export const SECTION_IDS = {
  HOME: "home",
  ABOUT: "about",
  PROCESS: "process",
  PRODUCTS: "products",
  TESTIMONIALS: "testimonials",
  CONTACT: "contact",
} as const;
