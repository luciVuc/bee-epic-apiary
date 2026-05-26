/** API client for fetching data from the services/ backend (Cloudflare Worker) */
import type {
  ISiteContent,
  IProduct,
  ITestimonial,
  IProcessStep,
  ICategory,
} from "../types";
import { transformStripeProductsList } from "./transform";

/** Base URL for the services API, configured via VITE_API_URL env var */
const API_BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:8787";

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

/** Fetch products from GET /products (with expanded default_price) and transform into IProduct[] */
export async function fetchProducts(): Promise<IProduct[]> {
  const response = await fetch(
    `${API_BASE_URL}/products?expand[]=data.default_price&limit=100`,
  );
  if (!response.ok) {
    throw new Error(`Failed to fetch products: ${response.statusText}`);
  }
  const data = await response.json();
  return transformStripeProductsList(data);
}

/** Fetch paginated products with search, category filter, and cursor-based pagination */
export async function fetchProductsPaginated(params: {
  search?: string;
  category?: string;
  limit?: number;
  starting_after?: string;
}): Promise<IPaginatedProductsResult> {
  const url = new URL(`${API_BASE_URL}/products`);
  url.searchParams.append("expand[]", "data.default_price");
  if (params.search) url.searchParams.append("search", params.search);
  if (params.category) url.searchParams.append("category", params.category);
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

/** Fetch all site data in parallel: site content, testimonials, process steps, and categories */
export async function fetchAllSiteData(): Promise<{
  siteContent: ISiteContent;
  testimonials: ITestimonial[];
  processSteps: IProcessStep[];
  categories: ICategory[];
}> {
  const [siteContent, testimonials, processSteps, categories] =
    await Promise.all([
      fetchSiteContent(),
      fetchTestimonials(),
      fetchProcessSteps(),
      fetchCategories(),
    ]);
  return { siteContent, testimonials, processSteps, categories };
}
