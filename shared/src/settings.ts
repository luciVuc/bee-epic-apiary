import { z } from "zod";
import { EmailFormatSchema } from "./email";

/**
 * Settings types — every shape stored under a key in `CONTENT_KV`.
 *
 * Reconciliation notes (from the Plan 2 review):
 *  - All hero/about/section-title copy is REQUIRED. The admin Site Content form
 *    has fields for every one of them, and the storefront renders them; falling
 *    back to defaults at runtime would mask onboarding mistakes.
 *  - `email`, `businessName`, `stripePublishableKey` REQUIRED — every storefront
 *    needs them to operate.
 *  - `formsparkFormId`, `emailFormat`, `notificationReplayHours`,
 *    `checkoutCancelledTitle/Message`, `lat/lng` optional.
 *  - Schemas use `.loose()` (Zod 4) instead of the deprecated `.passthrough()`,
 *    so unknown fields are preserved — important because tenants may write
 *    custom fields directly to KV and the storefront should ignore them
 *    gracefully.
 */

export const CategorySchema = z.object({
  id: z.string(),
  label: z.string(),
});
export type ICategory = z.infer<typeof CategorySchema>;

/** A single nav-bar link, used by the storefront header (in-page anchor links). */
export const NavLinkSchema = z.object({
  id: z.string(),
  label: z.string(),
});
export type INavLink = z.infer<typeof NavLinkSchema>;

/** Public social media URLs for the business; rendered in footer + contact section. */
export const SocialLinksSchema = z.object({
  instagram: z.string().optional(),
  facebook: z.string().optional(),
  etsy: z.string().optional(),
  twitter: z.string().optional(),
  youtube: z.string().optional(),
});
export type ISocialLinks = z.infer<typeof SocialLinksSchema>;

/**
 * The full site content blob stored under `CONTENT_KV['site']`. Validated on
 * `PUT /settings/site`; consumed by the storefront for every render.
 */
export const SiteContentSchema = z
  .object({
    businessName: z.string(),
    logo: z.string(),
    tagline: z.string(),
    heroHeadline: z.string(),
    heroSubheadline: z.string(),
    aboutTitle: z.string(),
    aboutText: z.array(z.string()),
    aboutImages: z.array(z.string()),
    processTitle: z.string(),
    processSubtitle: z.string(),
    productsTitle: z.string(),
    productsSubtitle: z.string(),
    testimonialsTitle: z.string(),
    testimonialsSubtitle: z.string(),
    contactTitle: z.string(),
    contactSubtitle: z.string(),
    noProductsFound: z.string(),
    footerTagline: z.string(),
    yearsExperience: z.string(),
    yearsExperienceLabel: z.string(),
    rawNatural: z.string(),
    rawNaturalLabel: z.string(),
    californiaProud: z.string(),
    californiaProudLabel: z.string(),
    sinceYear: z.string(),
    sinceYearLabel: z.string(),
    navLinks: z.array(NavLinkSchema),
    orderConfirmed: z.string(),
    orderConfirmationMessage: z.string(),
    questionsContact: z.string(),
    continueShopping: z.string(),
    categories: z.array(CategorySchema),
    // Required + email-shape validated (review M9). Previously \`z.string()\`
    // accepted any string, so a tenant could save a typo-ed address into KV
    // and the storefront would render it without complaint.
    email: z.email(),
    phone: z.string(),
    location: z.string(),
    socialLinks: SocialLinksSchema,
    stripePublishableKey: z.string(),
    // Optional fields
    checkoutCancelledTitle: z.string().optional(),
    checkoutCancelledMessage: z.string().optional(),
    lat: z.number().optional(),
    lng: z.number().optional(),
    formsparkFormId: z.string().optional(),
    emailFormat: EmailFormatSchema.optional(),
    /**
     * Replay window (hours, 1–24, default 1) the admin notification hub keeps
     * undelivered events available for replay after a browser reconnects.
     * See `services/src/notifications/notification-hub.ts`.
     */
    notificationReplayHours: z.number().int().min(1).max(24).optional(),
  })
  .loose();
export type ISiteContent = z.infer<typeof SiteContentSchema>;

/**
 * Lenient read-side schema for `GET /settings/site`. KV may hold partial
 * data during tenant onboarding; the storefront should render whatever it has
 * and let the admin fill in the rest. The strict schema above is the write-side
 * gate.
 */
export const SiteContentPartialSchema = SiteContentSchema.partial();

/** A single step in the "From Hive to Table" process. */
export const ProcessStepSchema = z.object({
  id: z.string(),
  step: z.number(),
  title: z.string(),
  description: z.string(),
  icon: z.string(),
});
export type IProcessStep = z.infer<typeof ProcessStepSchema>;

/** A customer testimonial entry. */
export const TestimonialSchema = z.object({
  id: z.string(),
  name: z.string(),
  location: z.string(),
  rating: z.number().min(1).max(5),
  text: z.string(),
  date: z.string(),
});
export type ITestimonial = z.infer<typeof TestimonialSchema>;

/** Array schemas — handy for PUT validation in services. */
export const ProcessStepsSchema = z.array(ProcessStepSchema);
export const TestimonialsSchema = z.array(TestimonialSchema);
export const CategoriesSchema = z.array(CategorySchema);

/** The keys CONTENT_KV stores. Mirrors `ESettingsType` in services. */
export enum ESettingsType {
  SITE = "SITE",
  PROCESS = "PROCESS",
  TESTIMONIALS = "TESTIMONIALS",
  CATEGORIES = "CATEGORIES",
  STAFF = "STAFF",
}
/**
 * Union of the settings keys, derived from `ESettingsType`.
 *
 * Intentionally an "internal escape hatch" — exported so legacy code paths
 * that need to enumerate the compile-time-known keys can avoid hand-typing
 * a parallel union (and drifting). Callers should NOT treat this as the
 * authoritative type for "valid settings paths" at runtime — the router
 * regex in `services/src/router.ts` is the source of truth for which
 * `/settings/<type>` paths actually exist on the server (review M8).
 */
export type SettingsType = keyof typeof ESettingsType;
