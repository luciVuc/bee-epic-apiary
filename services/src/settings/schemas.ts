/**
 * Schema barrel for `PUT /settings/:type` validation.
 *
 * As of Plan 2, the canonical Zod schemas live in `@bee-epic/shared/settings`.
 * Re-exported here under their existing names so `settings-handler.ts` and
 * any other call sites keep working unchanged.
 *
 * NOTE: the shared schema replaces the deprecated `.passthrough()` with
 * `.loose()` (Zod 4) — same runtime semantics (unknown fields are preserved).
 */

import { CategoriesSchema, SiteContentSchema, ProcessStepsSchema, TestimonialsSchema } from '@bee-epic/shared';

export const categorySchema = CategoriesSchema;
export const siteContentSchema = SiteContentSchema;
export const processStepsSchema = ProcessStepsSchema;
export const testimonialsSchema = TestimonialsSchema;
