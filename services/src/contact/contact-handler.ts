import { jsonResponse, handleCORS, RateLimiter } from '../utils';

function escapeHtml(str: string): string {
	return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

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

	let siteContent: { email?: string; businessName?: string };
	try {
		siteContent = JSON.parse(siteContentStr);
	} catch {
		return jsonResponse({ error: 'Invalid site content' }, 500, origin, env);
	}

	const adminEmail = siteContent.email;

	const formspreeFormId = (siteContent as Record<string, unknown>).formspreeFormId as string | undefined;
	if (formspreeFormId && formspreeFormId !== 'REPLACE_ME') {
		try {
			const formspreeRes = await fetch(`https://formspree.io/f/${formspreeFormId}`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ name, email, subject, message }),
			});
			if (!formspreeRes.ok) {
				console.error('Formspree returned:', formspreeRes.status);
				return jsonResponse({ error: 'Failed to send message' }, 500, origin, env);
			}
		} catch (error) {
			console.error('Failed to send via Formspree:', error);
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
			from: { email: `contact@${domain}`, name: siteContent.businessName || 'Contact Form' },
			replyTo: email,
			subject: `Contact Form: ${subject}`,
			text: `Name: ${name}\nEmail: ${email}\nSubject: ${subject}\n\n${message}`,
			html: `<p><strong>Name:</strong> ${escapeHtml(name)}</p>
<p><strong>Email:</strong> ${escapeHtml(email)}</p>
<p><strong>Subject:</strong> ${escapeHtml(subject)}</p>
<hr>
<p>${escapeHtml(message).replace(/\n/g, '<br>')}</p>`,
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
