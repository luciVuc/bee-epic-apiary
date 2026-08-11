/**
 * Services-side type barrel.
 *
 * As of Plan 2, the canonical type definitions live in `@bee-epic/shared`.
 * This file re-exports them so existing `import { ... } from '../types'`
 * call sites across `services/src/` keep working unchanged. New code should
 * import directly from `@bee-epic/shared`.
 */

export { ESettingsType, EStaffRole } from '@bee-epic/shared';
export type {
	SettingsType,
	ISiteContent,
	IOrderTemplateData,
	ICommTemplateData,
	IEmailBodyType,
	EmailFormat,
	IApiUpstreamError,
} from '@bee-epic/shared';

/**
 * Builder interface for Cloudflare Email Service `send()`.
 *
 * Kept defined locally (rather than in `@bee-epic/shared/email`) because it
 * references the Workers runtime types `EmailAddress` / `EmailAttachment`
 * — globals declared by `worker-configuration.d.ts` and unavailable in admin/web.
 */
import type { IEmailBodyType } from '@bee-epic/shared';
export interface IEmailMessageBuilder {
	/**
	 * Sender identity. Cloudflare's Email Service `send()` accepts either
	 * a bare RFC-5322 address string or a structured `EmailAddress`. We
	 * always pass `EmailAddress` so the `name` field renders in the
	 * recipient's inbox — narrowing the type makes that contract explicit
	 * (review M4).
	 */
	from: EmailAddress;
	to: string | EmailAddress | (string | EmailAddress)[];
	subject: string;
	replyTo?: string | EmailAddress;
	cc?: string | EmailAddress | (string | EmailAddress)[];
	bcc?: string | EmailAddress | (string | EmailAddress)[];
	headers?: Record<string, string>;
	body?: string | IEmailBodyType;
	attachments?: EmailAttachment[];
}
