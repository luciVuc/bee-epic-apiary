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

export interface IAdminSettings {
  apiUrl: string;
  stripePublishableKey: string;
}
