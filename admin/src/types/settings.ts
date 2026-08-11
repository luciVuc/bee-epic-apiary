/**
 * Settings type barrel.
 *
 * As of Plan 2, the cross-project settings types come from `@bee-epic/shared`.
 * Re-exported here so existing `import { ISiteContent, ... } from "../types/settings"`
 * imports keep working. New code should import from `@bee-epic/shared` directly.
 */

export type {
  ISiteContent,
  IProcessStep,
  ITestimonial,
  ICategory,
  INavLink,
  ISocialLinks,
} from "@bee-epic/shared";

/** Union of available settings tab identifiers (admin-only UI concern). */
export type SettingsTab =
  | "admin"
  | "site"
  | "process"
  | "testimonials"
  | "categories"
  | "users"
  | "security";
