/**
 * Builders for JSON-LD structured data (schema.org) embedded in page `<head>`s
 * via SeoHead. Each returns a plain object that gets JSON-stringified into a
 * `<script type="application/ld+json">` tag to improve search-engine rich results.
 */
import type { IProduct, ISiteContent } from "../types";
import { SITE_URL } from "./constants";

/** schema.org Organization node describing the business, its contact point, and social profiles. */
export function organizationSchema(content: ISiteContent) {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: content.businessName,
    url: SITE_URL,
    logo: content.logo || undefined,
    description: content.tagline,
    contactPoint: {
      "@type": "ContactPoint",
      telephone: content.phone,
      email: content.email,
      contactType: "customer service",
    },
    sameAs: [
      content.socialLinks.facebook,
      content.socialLinks.instagram,
      content.socialLinks.twitter,
      content.socialLinks.youtube,
      content.socialLinks.etsy,
    ].filter(Boolean),
  };
}

/** schema.org WebSite node, including a SearchAction pointing at the products search. */
export function websiteSchema(content: ISiteContent) {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: content.businessName,
    url: SITE_URL,
    description: content.tagline,
    potentialAction: {
      "@type": "SearchAction",
      target: {
        "@type": "EntryPoint",
        urlTemplate: `${SITE_URL}/products?search={search_term_string}`,
      },
      "query-input": "required name=search_term_string",
    },
  };
}

/** schema.org Product node with a priced Offer; price is converted from cents to dollars. */
export function productSchema(product: IProduct) {
  return {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.name,
    description: product.description,
    image: product.imageUrls[0] || undefined,
    sku: product.slug,
    offers: {
      "@type": "Offer",
      price: product.price / 100,
      priceCurrency: "USD",
      availability: product.inStock
        ? "https://schema.org/InStock"
        : "https://schema.org/OutOfStock",
    },
    category: product.category,
  };
}

/** schema.org BreadcrumbList from ordered {name, url} items; positions are 1-based and URLs prefixed with SITE_URL. */
export function breadcrumbSchema(items: { name: string; url: string }[]) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      item: `${SITE_URL}${item.url}`,
    })),
  };
}

/** schema.org LocalBusiness node; omits the Place/address block when no location is set. */
export function localBusinessSchema(content: ISiteContent) {
  return {
    "@context": "https://schema.org",
    "@type": "LocalBusiness",
    name: content.businessName,
    image: content.logo || undefined,
    telephone: content.phone,
    email: content.email,
    description: content.tagline,
    url: SITE_URL,
    location: content.location
      ? {
          "@type": "Place",
          address: {
            "@type": "PostalAddress",
            addressLocality: content.location,
          },
        }
      : undefined,
  };
}
