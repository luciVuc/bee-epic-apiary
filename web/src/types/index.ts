export enum EProductCategory {
  HONEY = "HONEY",
  BEESWAX = "BEESWAX",
  GIFTS = "GIFTS",
  SUBSCRIPTIONS = "SUBSCRIPTIONS",
}

export type ProductCategory = keyof typeof EProductCategory;

export interface IProduct {
  id: string;
  name: string;
  slug: string;
  description: string;
  longDescription: string;
  price: number;
  stripePriceId?: string;
  stripePaymentLinkId?: string;
  category: EProductCategory | ProductCategory;
  imageUrls: string[];
  thumbnailUrls: string[];
  inStock: boolean;
  featured: boolean;
  weight: string;
  tags: string[];
}

export interface ICartItem {
  product: IProduct;
  quantity: number;
}

export interface ITestimonial {
  id: string;
  name: string;
  location: string;
  rating: number;
  text: string;
  date: string;
}

export interface IProcessStep {
  id: string;
  step: number;
  title: string;
  description: string;
  icon: string;
}

export interface ICategory {
  id: string;
  label: string;
}

export interface ISocialLinks {
  instagram?: string;
  facebook?: string;
  etsy?: string;
  twitter?: string;
  youtube?: string;
}

export interface INavLink {
  id: string;
  label: string;
}

export interface ISiteContent {
  businessName: string;
  tagline: string;
  heroHeadline: string;
  heroSubheadline: string;
  aboutTitle: string;
  aboutText: string[];
  processTitle: string;
  processSubtitle: string;
  productsTitle: string;
  productsSubtitle: string;
  testimonialsTitle: string;
  testimonialsSubtitle: string;
  contactTitle: string;
  contactSubtitle: string;
  noProductsFound: string;
  footerTagline: string;
  yearsExperience: string;
  yearsExperienceLabel: string;
  rawNatural: string;
  rawNaturalLabel: string;
  californiaProud: string;
  californiaProudLabel: string;
  sinceYear: string;
  sinceYearLabel: string;
  navLinks: INavLink[];
  orderConfirmed: string;
  orderConfirmationMessage: string;
  questionsContact: string;
  continueShopping: string;
  categories: ICategory[];
  checkoutCancelledTitle?: string;
  checkoutCancelledMessage?: string;
  email: string;
  phone: string;
  location: string;
  socialLinks: ISocialLinks;
  formspreeFormId: string;
}
