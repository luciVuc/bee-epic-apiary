export const SITE_URL =
  import.meta.env.VITE_SITE_URL || "http://localhost:5173";
export const STRIPE_PUBLISHABLE_KEY =
  import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY || "";
export const FORMSPREE_FORM_ID = import.meta.env.VITE_FORMSPREE_FORM_ID || "";

export const GITHUB_PAGES_BASE = "/golden-hive-apiary/";

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
