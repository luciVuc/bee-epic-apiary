/** Application-wide constants and default data values */
import type {
  ISiteContent,
  IProcessStep,
  ITestimonial,
  ICategory,
} from "../types/settings";

/** Fallback SVG data URI used when no product image is available */
export const DEFAULT_PRODUCT_IMAGE = `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="orange" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-package w-16 h-16 text-dark-300 mx-auto mb-4"><path d="m7.5 4.27 9 5.15"></path><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"></path><path d="m3.3 7 8.7 5 8.7-5"></path><path d="M12 22V12"></path></svg>`;
/** Fallback SVG data URI used when no product thumbnail is available */
export const DEFAULT_PRODUCT_THUMBNAIL = `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="orange" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-package w-16 h-16 text-dark-300 mx-auto mb-4"><path d="m7.5 4.27 9 5.15"></path><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"></path><path d="m3.3 7 8.7 5 8.7-5"></path><path d="M12 22V12"></path></svg>`;

/** localStorage key for persisting admin settings */
export const SETTINGS_STORAGE_KEY = "beeEpicAdminSettings";

/** Custom event dispatched when an order's internal status (new/pending/fulfilled) is updated */
export const ORDER_STATUS_CHANGED_EVENT = "order-status-changed";

/** Custom event dispatched when a new order notification is received via SSE */
export const NEW_ORDER_EVENT = "new-order-received";

/** Default product categories used when no remote categories are loaded */
export const CATEGORIES = [
  { id: "HONEY", label: "Honey" },
  { id: "BEESWAX", label: "Beeswax" },
  { id: "GIFTS", label: "Gift Sets" },
  { id: "SUBSCRIPTIONS", label: "Subscriptions" },
] satisfies ICategory[];

export const DEFAULT_SITE: ISiteContent = {
  businessName: "Bee Epic Apiary",
  tagline: "Pure, Raw Honey from Bay Area's Finest Flowers",
  heroHeadline: "Nature's Sweetest Gift, Straight from the Hive",
  heroSubheadline:
    "Small-batch, raw honey harvested with care from our California apiary. Every jar captures the essence of wild California flowers.",
  aboutTitle: "Our Story",
  aboutImages: [],
  aboutText: [
    "Bee Epic Apiary was founded in 2009 when beekeeper Sarah Mitchell received her first two hives as a wedding gift. What started as a quiet hobby in the meadows of rural California has grown into a beloved local business dedicated to sustainable beekeeping and exceptional honey.",
    "Our bees forage among the pristine wildflowers of the Green Mountain State, away from pesticides and industrial agriculture. We believe in letting nature do its work — our honey is never heated, filtered, or processed. It goes from hive to jar just as the bees made it.",
    "Every drop of Bee Epic Apiary honey carries the flavors of California: clover, wildflower, buckwheat, and apple blossom. We're proud to share this liquid gold with families across the Bay Area and beyond.",
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
  phone: "(510) 555-APIARY",
  location: "Union City, California",
  categories: [
    { id: "ALL", label: "All Products" },
    { id: "HONEY", label: "Honey" },
    { id: "BEESWAX", label: "Beeswax" },
    { id: "GIFTS", label: "Gift Sets" },
    { id: "SUBSCRIPTIONS", label: "Subscriptions" },
  ],
  socialLinks: {
    instagram: "https://instagram.com/beeepicapiary",
    facebook: "https://facebook.com/beeepicapiary",
    etsy: "https://etsy.com/shop/beeepicapiary",
  },
  formspreeFormId: "",
};

export const DEFAULT_PROCESS: IProcessStep[] = [
  {
    id: "process-1",
    step: 1,
    title: "The Hive",
    description:
      "Our bees live in carefully placed hives throughout California's pristine meadows, far from pesticides and industrial farmland.",
    icon: "Home",
  },
  {
    id: "process-2",
    step: 2,
    title: "Foraging",
    description:
      "Bees venture miles from the hive, collecting nectar from wildflowers, clover, apple blossoms, and buckwheat.",
    icon: "Flower2",
  },
  {
    id: "process-3",
    step: 3,
    title: "The Nectar",
    description:
      "Returning bees pass nectar to house bees, who fan their wings to evaporate moisture and transform it into honey.",
    icon: "Wind",
  },
  {
    id: "process-4",
    step: 4,
    title: "Sealing",
    description:
      "When moisture content drops below 18%, bees seal each cell with fresh beeswax — nature's perfect preservation.",
    icon: "Shield",
  },
  {
    id: "process-5",
    step: 5,
    title: "Harvest",
    description:
      "We carefully extract frames, strain to remove debris, and bottle — raw, unheated, and unfiltered.",
    icon: "Award",
  },
];

export const DEFAULT_CATEGORIES: ICategory[] = [
  { id: "HONEY", label: "Honey" },
  { id: "BEESWAX", label: "Beeswax" },
  { id: "GIFTS", label: "Gift Sets" },
  { id: "SUBSCRIPTIONS", label: "Subscriptions" },
];

export const DEFAULT_TESTIMONIALS: ITestimonial[] = [
  {
    id: "testimonial-1",
    name: "Jennifer Walker",
    location: "Burlington, VT",
    rating: 5,
    text: "I've been buying Golden Hive honey for years, and it never disappoints. The wildflower honey is absolutely divine.",
    date: "2024-12-15",
  },
  {
    id: "testimonial-2",
    name: "Robert Chen",
    location: "Boston, MA",
    rating: 5,
    text: "Ordered the gift set for my mother's birthday, and she loved it! The packaging was beautiful, and the honey was the best she's ever had.",
    date: "2024-11-28",
  },
  {
    id: "testimonial-3",
    name: "Emily Hartwell",
    location: "Montpelier, VT",
    rating: 5,
    text: "As a fellow beekeeper, I really appreciate the care Golden Hive takes with their bees. The buckwheat honey is incredible.",
    date: "2024-10-10",
  },
  {
    id: "testimonial-4",
    name: "Michael Torres",
    location: "New York, NY",
    rating: 5,
    text: "The beeswax candles are a game changer. They burn so nicely and give off the most wonderful warm glow.",
    date: "2024-09-22",
  },
  {
    id: "testimonial-5",
    name: "Sarah & David Miller",
    location: "Portland, OR",
    rating: 5,
    text: "We discovered Golden Hive at a farmers market and were immediately hooked. The lip balms are now a staple in our household.",
    date: "2024-08-05",
  },
];
