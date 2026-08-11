import type { ISiteContent } from "../types";

/** Inline SVG data URI (a bee emoji) used as the logo when site content has none. */
export const DEFAULT_LOGO = `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Ctext x='50' y='80' font-size='80' text-anchor='middle'%3E%F0%9F%90%9D%3C/text%3E%3C/svg%3E`;

/**
 * Base URL for the services API. Uses VITE_API_URL when set, otherwise a
 * same-origin relative path in production and localhost:8787 in dev.
 */
export const DEFAULT_API_URL =
  import.meta.env.VITE_API_URL ||
  (import.meta.env.PROD ? "" : "http://localhost:8787");
/** Public site origin, used to build canonical URLs and structured-data links. */
export const SITE_URL =
  import.meta.env.VITE_SITE_URL || "http://localhost:5173";
/** Stripe publishable key from env; empty string when unset (live value normally comes from KV). */
export const STRIPE_PUBLISHABLE_KEY =
  import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY || "";

/** Default page size for the paginated products listing. */
export const PRODUCTS_PER_PAGE = 12;

/**
 * Fallback site content shown before (or if) the live KV `site` value loads.
 * Every field here is overridden at runtime by App.tsx's fetchAllSiteData().
 */
export const DEFAULT_SITE: ISiteContent = {
  businessName: "Bee Epic Apiary",
  logo: DEFAULT_LOGO,
  tagline: "Pure, Raw Honey from Bay Area's Finest Flowers",
  heroHeadline: "Nature's Sweetest Gift, Straight from the Hive",
  heroSubheadline:
    "Small-batch, raw honey harvested with care from our California apiary. Every jar captures the essence of wild California flowers.",
  aboutTitle: "Our Story",
  aboutImages: [],
  aboutText: [
    "Bee Epic Apiary harvests the finest raw honey from California's pristine wildflower meadows. Every jar is pure, unheated, and unfiltered.",
  ],
  processTitle: "From Hive to Your Table",
  processSubtitle:
    "Follow our journey from the first flower to your kitchen shelf",
  productsTitle: "Our Products",
  productsSubtitle:
    "Small-batch, raw honey and bee products from our California apiary",
  testimonialsTitle: "What Our Customers Say",
  testimonialsSubtitle: "Join our community of honey lovers",
  contactTitle: "Contact Us",
  contactSubtitle: "We'd love to hear from you",
  noProductsFound: "No products found in this category.",
  footerTagline: "Built with ❤️ in California",
  yearsExperience: "15+ Years",
  yearsExperienceLabel: "of Experience",
  rawNatural: "100%",
  rawNaturalLabel: "Raw & Natural",
  californiaProud: "California",
  californiaProudLabel: "Proud",
  sinceYear: "Since 2009",
  sinceYearLabel: "Sustaining beekeeping tradition",
  navLinks: [
    { id: "home", label: "Home" },
    { id: "about", label: "About" },
    { id: "process", label: "Our Process" },
    { id: "products", label: "Shop" },
    { id: "testimonials", label: "Testimonials" },
    { id: "contact", label: "Contact" },
  ],
  orderConfirmed: "Order Confirmed!",
  orderConfirmationMessage:
    "Thank you for your order. A confirmation email will be sent shortly.",
  questionsContact: "Questions? Contact us at",
  continueShopping: "Continue Shopping",
  email: "hello@beeepicapiary.com",
  // TODO(business): replace placeholder phone with real business line when
  // tenant data is wired into CONTENT_KV. The KV `site` value overrides this
  // at runtime — this is only the fallback shown during initial fetch.
  phone: "(510) 555-APIARY",
  location: "Union City, California",
  socialLinks: {
    instagram: "https://instagram.com/beeepicapiary",
    facebook: "https://facebook.com/beeepicapiary",
    etsy: "https://etsy.com/shop/beeepicapiary",
  },
  categories: [
    { id: "ALL", label: "All Products" },
    { id: "HONEY", label: "Honey" },
    { id: "BEESWAX", label: "Beeswax" },
    { id: "GIFTS", label: "Gift Sets" },
    { id: "SUBSCRIPTIONS", label: "Subscriptions" },
  ],
  // Populated at build time from VITE_STRIPE_PUBLISHABLE_KEY; the live KV
  // value normally overrides this in App.tsx's fetchAllSiteData().
  stripePublishableKey: STRIPE_PUBLISHABLE_KEY,
};

/** Stable string keys for the single-page anchor sections (nav/scroll targets). */
export const SECTION_IDS = {
  HOME: "home",
  ABOUT: "about",
  PROCESS: "process",
  PRODUCTS: "products",
  TESTIMONIALS: "testimonials",
  CONTACT: "contact",
} as const;
