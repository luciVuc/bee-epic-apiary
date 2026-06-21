/** API client for fetching data from the services/ backend (Cloudflare Worker) */
import type {
  ISiteContent,
  IProduct,
  ITestimonial,
  IProcessStep,
  ICategory,
} from "../types";
import { DEFAULT_API_URL, DEFAULT_SITE } from "./constants";
import {
  transformStripeProduct,
  transformStripeProductsList,
} from "./transform";

/** Base URL for the services API, configured via VITE_API_URL env var */
const API_BASE_URL = DEFAULT_API_URL;

/** Fetch site content (business info, hero, about, nav, etc.) from GET /settings/site */
export async function fetchSiteContent(): Promise<ISiteContent> {
  const response = await fetch(`${API_BASE_URL}/settings/site`);
  if (!response.ok) {
    throw new Error(`Failed to fetch site content: ${response.statusText}`);
  }
  return response.json();
}

/** Fetch process steps from GET /settings/process */
export async function fetchProcessSteps(): Promise<IProcessStep[]> {
  const response = await fetch(`${API_BASE_URL}/settings/process`);
  if (!response.ok) {
    throw new Error(`Failed to fetch process steps: ${response.statusText}`);
  }
  return response.json();
}

/** Fetch testimonials from GET /settings/testimonials */
export async function fetchTestimonials(): Promise<ITestimonial[]> {
  const response = await fetch(`${API_BASE_URL}/settings/testimonials`);
  if (!response.ok) {
    throw new Error(`Failed to fetch testimonials: ${response.statusText}`);
  }
  return response.json();
}

/** Fetch categories from GET /settings/categories */
export async function fetchCategories(): Promise<ICategory[]> {
  const response = await fetch(`${API_BASE_URL}/settings/categories`);
  if (!response.ok) {
    throw new Error(`Failed to fetch categories: ${response.statusText}`);
  }
  return response.json();
}

export interface IPaginatedProductsResult {
  products: IProduct[];
  hasMore: boolean;
  totalCount: number;
}

/** Fetch a single product by slug from GET /products/:slug (uses Stripe search API) */
export async function fetchProductBySlug(
  slug: string,
): Promise<IProduct | null> {
  const response = await fetch(
    `${API_BASE_URL}/products/${encodeURIComponent(slug)}?expand[]=data.default_price`,
  );
  if (response.status === 404) return null;
  if (!response.ok) {
    throw new Error(`Failed to fetch product: ${response.statusText}`);
  }
  const data = await response.json();
  return transformStripeProduct(data);
}

/** Fetch paginated products with search, category filter, tag filter, and cursor-based pagination */
export async function fetchProductsPaginated(params: {
  search?: string;
  category?: string;
  tag?: string;
  limit?: number;
  starting_after?: string;
}): Promise<IPaginatedProductsResult> {
  const url = new URL(`${API_BASE_URL}/products`);
  url.searchParams.append("expand[]", "data.default_price");
  if (params.search) url.searchParams.append("search", params.search);
  if (params.category) url.searchParams.append("category", params.category);
  if (params.tag) url.searchParams.append("tag", params.tag);
  if (params.limit) url.searchParams.append("limit", String(params.limit));
  if (params.starting_after)
    url.searchParams.append("starting_after", params.starting_after);

  const response = await fetch(url.toString());
  if (!response.ok) {
    throw new Error(`Failed to fetch products: ${response.statusText}`);
  }
  const data = await response.json();
  return {
    products: transformStripeProductsList(data),
    hasMore: data.has_more ?? false,
    totalCount: data.total_count ?? 0,
  };
}

export interface IContactFormData {
  name: string;
  email: string;
  subject: string;
  message: string;
  _gotcha?: string;
}

/** Submit contact form data to POST /contact on the services worker */
export async function submitContactForm(data: IContactFormData): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/contact`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!response.ok) {
    const err = await response.json().catch(() => null);
    throw new Error(err?.error || "Failed to send message");
  }
}

/** Fetch all site data in parallel with graceful fallbacks for empty KV stores */
export async function fetchAllSiteData(): Promise<{
  siteContent: ISiteContent;
  testimonials: ITestimonial[];
  processSteps: IProcessStep[];
  categories: ICategory[];
}> {
  const results = await Promise.allSettled([
    fetchSiteContent(),
    fetchTestimonials(),
    fetchProcessSteps(),
    fetchCategories(),
  ]);

  return {
    siteContent:
      results[0].status === "fulfilled" ? results[0].value : DEFAULT_SITE,
    testimonials: results[1].status === "fulfilled" ? results[1].value : [],
    processSteps: results[2].status === "fulfilled" ? results[2].value : [],
    categories: results[3].status === "fulfilled" ? results[3].value : [],
  };
}
