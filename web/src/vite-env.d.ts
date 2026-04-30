/// <reference types="vite/client" />

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
  stripePriceId: string;
  stripePaymentLinkId?: string;
  category: EProductCategory;
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

export interface ISocialLinks {
  instagram?: string;
  facebook?: string;
  etsy?: string;
}

export interface ISiteContent {
  businessName: string;
  tagline: string;
  heroHeadline: string;
  heroSubheadline: string;
  aboutTitle: string;
  aboutText: string[];
  email: string;
  phone: string;
  location: string;
  socialLinks: ISocialLinks;
}
