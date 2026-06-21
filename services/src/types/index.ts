export enum ESettingsType {
	SITE = 'SITE',
	PROCESS = 'PROCESS',
	TESTIMONIALS = 'TESTIMONIALS',
	CATEGORIES = 'CATEGORIES',
}

export type SettingsType = keyof typeof ESettingsType;

export interface IAPIResponseError {
	status?: number;
	statusCode?: number;
	code?: string;
	message?: string;
	stack?: string;
	type?: string;
}

/** Site content stored in CONTENT_KV used for email routing and notification formatting */
export interface ISiteContent {
	email?: string;
	businessName?: string;
	formsparkFormId?: string;
	emailFormat?: EmailFormat;
}

/** Data payload for order notification email templates */
export interface IOrderTemplateData {
	sessionId: string;
	customerName: string;
	customerEmail: string;
	amountTotal: string;
	orderLink: string;
	businessName: string;
}

/** Data payload for contact form notification email templates */
export interface ICommTemplateData {
	name: string;
	email: string;
	subject: string;
	message: string;
}

/** Request body for POST /orders/confirm */
export interface IConfirmOrderBody {
	sessionId: string;
}

/** Supported email body formats */
export type EmailFormat = 'text' | 'markdown' | 'html';

/** Structured email body for the Cloudflare Email Service `body` field */
export interface IEmailBodyType {
	type: 'text' | 'html';
	content: string;
}

/** Builder interface for Cloudflare Email Service `send()` */
export interface IEmailMessageBuilder {
	from: string | EmailAddress;
	to: string | EmailAddress | (string | EmailAddress)[];
	subject: string;
	replyTo?: string | EmailAddress;
	cc?: string | EmailAddress | (string | EmailAddress)[];
	bcc?: string | EmailAddress | (string | EmailAddress)[];
	headers?: Record<string, string>;
	body?: string | IEmailBodyType;
	attachments?: EmailAttachment[];
}
