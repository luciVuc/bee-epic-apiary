import { ICommTemplateData, ISiteContent, IEmailMessageBuilder } from '../types';
import { jsonOk, jsonErr, handleCORS, RateLimiter, buildEmailBody } from '../utils';

export async function handleContact(request: Request, env: Env): Promise<Response> {
	if (request.method === 'OPTIONS') {
		return handleCORS(request, env, 'POST');
	}

	const origin = request.headers.get('Origin');

	if (request.method !== 'POST') {
		return jsonErr({ code: 'METHOD_NOT_ALLOWED', allowed: ['POST', 'OPTIONS'] }, origin, env);
	}

	if (env.RATE_LIMITER) {
		const clientIP =
			(request as Request<unknown, IncomingRequestCfProperties>).cf?.connectingIp || request.headers.get('CF-Connecting-IP') || 'unknown';
		const rateLimiter = new RateLimiter(env.RATE_LIMITER, {
			maxRequests: parseInt(env.RATE_LIMIT_MAX, 10),
			windowSeconds: parseInt(env.RATE_LIMIT_WINDOW, 10),
		});
		const result = await rateLimiter.check(`${clientIP}:POST:/contact`);
		if (!result.allowed) {
			return jsonErr({ code: 'RATE_LIMITED', retryAfter: result.resetTime }, origin, env);
		}
	}

	let body: { name?: string; email?: string; subject?: string; message?: string; _gotcha?: string };
	try {
		body = await request.json();
	} catch {
		return jsonErr({ code: 'BAD_REQUEST', message: 'Invalid JSON body' }, origin, env);
	}

	// Honeypot — silently succeed to fool bots
	if (body._gotcha) {
		return jsonOk({ sent: true }, origin, env);
	}

	const { name, email, subject, message } = body;
	if (!name || !email || !subject || !message) {
		return jsonErr({ code: 'VALIDATION_FAILED', fields: { body: 'Missing required fields: name, email, subject, message' } }, origin, env);
	}

	const siteContentStr = await env.CONTENT_KV.get('site');
	if (!siteContentStr) {
		return jsonErr({ code: 'INTERNAL' }, origin, env);
	}

	let siteContent: ISiteContent;
	try {
		siteContent = JSON.parse(siteContentStr);
	} catch {
		return jsonErr({ code: 'INTERNAL' }, origin, env);
	}

	const adminEmail = siteContent.email;
	const businessName = siteContent.businessName || 'Bee Epic Apiary';
	const emailFormat = siteContent.emailFormat || 'html';
	const formsparkFormId = siteContent.formsparkFormId;

	const templateData: ICommTemplateData = { name, email, subject, message };

	if (formsparkFormId && formsparkFormId !== 'REPLACE_ME') {
		try {
			const formsparkBody = {
				_email: { subject: `Message: ${subject}` },
				body: await buildEmailBody(emailFormat, templateData),
			};
			const formsparkRes = await fetch(`https://submit-form.com/${formsparkFormId}`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
				body: JSON.stringify(formsparkBody),
			});
			if (!formsparkRes.ok) {
				const errBody = await formsparkRes.text().catch(() => '');
				console.error('Formspark returned:', formsparkRes.status, errBody);
				return jsonErr({ code: 'INTERNAL' }, origin, env);
			}
		} catch (error) {
			console.error('Failed to send via Formspark:', error);
			return jsonErr({ code: 'INTERNAL' }, origin, env);
		}
		return jsonOk({ sent: true }, origin, env);
	}

	if (!adminEmail) {
		return jsonErr({ code: 'INTERNAL' }, origin, env);
	}

	const domain = adminEmail.split('@')[1];
	if (!domain) {
		return jsonErr({ code: 'INTERNAL' }, origin, env);
	}

	try {
		// Typed as IEmailMessageBuilder (like the other EMAIL.send call sites) so
		// the structured `from` + `body` shape is checked against our contract
		// rather than the raw SendEmail overloads, which don't expose `body`.
		const emailPayload: IEmailMessageBuilder = {
			to: adminEmail,
			from: { email: `contact@${domain}`, name: businessName },
			replyTo: email,
			subject: `Contact Form: ${subject}`,
			body: {
				type: emailFormat === 'html' || emailFormat === 'markdown' ? 'html' : 'text',
				content: await buildEmailBody(emailFormat, templateData),
			},
		};
		await env.EMAIL.send(emailPayload);
	} catch (error) {
		console.error('Failed to send contact email:', error);
		return jsonErr({ code: 'INTERNAL' }, origin, env);
	}

	return jsonOk({ sent: true }, origin, env);
}

export default {
	fetch: handleContact,
} satisfies ExportedHandler<Env>;
