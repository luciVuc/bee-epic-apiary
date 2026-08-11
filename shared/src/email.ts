/**
 * Email-related types used across the monorepo.
 *
 * The transactional-mail payload types (`IOrderTemplateData`, `ICommTemplateData`,
 * `EmailFormat`) live here because the template-rendering helpers in `services/`
 * accept them, and admin/web may want to preview rendered templates in future.
 *
 * `IEmailMessageBuilder` — the shape Cloudflare's `env.EMAIL.send()` accepts —
 * intentionally stays in services/, where it can use Cloudflare's runtime
 * `EmailAddress` / `EmailAttachment` globals from worker-configuration.d.ts.
 * Hoisting it here would force `shared/` to depend on workers-types.
 */
import { z } from "zod";

/**
 * Supported email body formats. `EmailFormatSchema` is the canonical runtime
 * validator; `EmailFormat` is its inferred TS type. Importers should NOT
 * declare a parallel `z.enum(["text", "markdown", "html"])` — reuse this one
 * so the set stays in sync everywhere.
 */
export const EmailFormatSchema = z.enum(["text", "markdown", "html"]);
export type EmailFormat = z.infer<typeof EmailFormatSchema>;

/** Structured email body for the Cloudflare Email Service `body` field. */
export interface IEmailBodyType {
  type: "text" | "html";
  content: string;
}

/** Data payload for order notification email templates. */
export interface IOrderTemplateData {
  sessionId: string;
  customerName: string;
  customerEmail: string;
  amountTotal: string;
  orderLink: string;
  businessName: string;
}

/** Data payload for contact form notification email templates. */
export interface ICommTemplateData {
  name: string;
  email: string;
  subject: string;
  message: string;
}
