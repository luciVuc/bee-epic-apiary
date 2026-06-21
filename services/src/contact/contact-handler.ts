import { ICommTemplateData, ISiteContent } from '../types';
import { jsonResponse, handleCORS, RateLimiter, buildEmailBody } from '../utils';

export async function handleContact(request: Request, env: Env): Promise<Response> {
	if (request.method === 'OPTIONS') {
		return handleCORS(request, env, 'POST');
	}

	if (request.method !== 'POST') {
		return jsonResponse({ error: 'Method not allowed' }, 405);
	}

	const origin = request.headers.get('Origin');

	if (env.RATE_LIMIT_KV) {
		const clientIP =
			(request as Request<unknown, IncomingRequestCfProperties>).cf?.connectingIp || request.headers.get('CF-Connecting-IP') || 'unknown';
		const rateLimiter = new RateLimiter(env.RATE_LIMIT_KV, {
			maxRequests: parseInt(env.RATE_LIMIT_MAX, 10),
			windowSeconds: parseInt(env.RATE_LIMIT_WINDOW, 10),
		});
		const result = await rateLimiter.check(`${clientIP}:POST:/contact`);
		if (!result.allowed) {
			return jsonResponse({ error: 'Rate limit exceeded' }, 429, origin, env);
		}
	}

	let body: { name?: string; email?: string; subject?: string; message?: string; _gotcha?: string };
	try {
		body = await request.json();
	} catch {
		return jsonResponse({ error: 'Invalid JSON body' }, 400, origin, env);
	}

	if (body._gotcha) {
		return jsonResponse({ success: true }, 200, origin, env);
	}

	const { name, email, subject, message } = body;
	if (!name || !email || !subject || !message) {
		return jsonResponse({ error: 'Missing required fields: name, email, subject, message' }, 400, origin, env);
	}

	const siteContentStr = await env.CONTENT_KV.get('site');
	if (!siteContentStr) {
		return jsonResponse({ error: 'Site content not configured' }, 500, origin, env);
	}

	let siteContent: ISiteContent;
	try {
		siteContent = JSON.parse(siteContentStr);
	} catch {
		return jsonResponse({ error: 'Invalid site content' }, 500, origin, env);
	}

	const adminEmail = siteContent.email;
	const businessName = siteContent.businessName || 'Bee Epic Apiary';
	const emailFormat = siteContent.emailFormat || 'html';
	const formsparkFormId = siteContent.formsparkFormId;

	const templateData: ICommTemplateData = {
		name,
		email,
		subject,
		message,
	};

	if (formsparkFormId && formsparkFormId !== 'REPLACE_ME') {
		try {
			const formsparkBody = {
				_email: { subject: `Message: ${subject}` },
				body: await buildEmailBody(emailFormat, templateData),
			};

			console.log('Sending to Formspark with payload:', formsparkBody);
			const formsparkRes = await fetch(`https://submit-form.com/${formsparkFormId}`, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					Accept: 'application/json',
				},
				body: JSON.stringify(formsparkBody),
			});
			if (!formsparkRes.ok) {
				const body = await formsparkRes.text().catch(() => '');
				console.error('Formspark returned:', formsparkRes.status, body);
				return jsonResponse({ error: 'Failed to send message' }, 500, origin, env);
			}
		} catch (error) {
			console.error('Failed to send via Formspark:', error);
			return jsonResponse({ error: 'Failed to send message' }, 500, origin, env);
		}

		return jsonResponse({ success: true }, 200, origin, env);
	}

	if (!adminEmail) {
		return jsonResponse({ error: 'Contact email not configured' }, 500, origin, env);
	}

	const domain = adminEmail.split('@')[1];
	if (!domain) {
		return jsonResponse({ error: 'Invalid contact email configured' }, 500, origin, env);
	}

	try {
		await env.EMAIL.send({
			to: adminEmail,
			from: { email: `contact@${domain}`, name: businessName },
			replyTo: email,
			subject: `Contact Form: ${subject}`,
			body: {
				type: emailFormat === 'html' || emailFormat === 'markdown' ? 'html' : 'text',
				content: await buildEmailBody(emailFormat, templateData),
			},
		});
	} catch (error) {
		console.error('Failed to send contact email:', error);
		return jsonResponse({ error: 'Failed to send message' }, 500, origin, env);
	}

	return jsonResponse({ success: true }, 200, origin, env);
}

export default {
	fetch: handleContact,
} satisfies ExportedHandler<Env>;
