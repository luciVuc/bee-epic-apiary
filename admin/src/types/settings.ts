export interface ICategory {
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
  navLinks: { id: string; label: string }[];
  orderConfirmed: string;
  orderConfirmationMessage: string;
  questionsContact: string;
  continueShopping: string;
  email: string;
  phone: string;
  location: string;
  categories: ICategory[];
  socialLinks: { instagram: string; facebook: string; etsy: string };
}

export interface IProcessStep {
  id: string;
  step: number;
  title: string;
  description: string;
  icon: string;
}

export interface ITestimonial {
  id: string;
  name: string;
  location: string;
  rating: number;
  text: string;
  date: string;
}

export type SettingsTab =
  | "admin"
  | "site"
  | "process"
  | "testimonials"
  | "categories";
