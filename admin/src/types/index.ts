/** Product category enum matching Stripe metadata values */
export enum EProductCategory {
  HONEY = "HONEY",
  BEESWAX = "BEESWAX",
  GIFTS = "GIFTS",
  SUBSCRIPTIONS = "SUBSCRIPTIONS",
}

/** Union type of product category keys */
export type ProductCategory = keyof typeof EProductCategory;

/** Full product shape as used by the admin UI, transformed from Stripe */
export interface IProduct {
  id: string;
  name: string;
  slug: string;
  description: string;
  longDescription?: string;
  price: number;
  stripePriceId?: string;
  stripePaymentLinkId?: string;
  category: string;
  imageUrls: string[];
  thumbnailUrls: string[];
  inStock: boolean;
  featured: boolean;
  weight: string;
  tags: string[];
  recurringInterval?: string;
  recurringIntervalCount?: number;
}

/** Input shape for creating/updating a product (before Stripe transformation) */
export interface IProductInput {
  name: string;
  slug: string;
  description: string;
  longDescription?: string;
  price: number;
  stripePaymentLinkId?: string;
  category: string;
  imageUrls: string[];
  thumbnailUrls: string[];
  inStock: boolean;
  featured: boolean;
  weight: string;
  tags: string[];
  recurringInterval?: string;
  recurringIntervalCount?: number;
}

/** Computed statistics for the dashboard page */
export interface IDashboardStats {
  totalProducts: number;
  inStockProducts: number;
  featuredProducts: number;
  totalCategories: number;
  honeyProducts: number;
  beeswaxProducts: number;
  giftProducts: number;
  subscriptionProducts: number;
}

/** Admin panel connection settings (stored in localStorage) */
export interface IAdminSettings {
  apiUrl: string;
  stripePublishableKey: string;
  apiSecretKey?: string;
}
