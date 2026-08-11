import { describe, it, expect } from 'vitest';
import { stripeErrorResponse, safeStripeMessage } from '../../src/utils/stripeErrorResponse';
import type { IApiUpstreamError } from '../../src/types';

const env = { ALLOWED_ORIGINS: 'https://example.com' } as Env;
const origin = 'https://example.com';

/**
 * Guards the info-disclosure fix: only genuine input-validation / card errors
 * relay their real message; every other Stripe error type (auth, connection,
 * API, rate-limit, …) must be scrubbed to a generic string so upstream detail
 * never reaches — potentially unauthenticated — callers (e.g. /checkout).
 */
describe('safeStripeMessage', () => {
	it('relays the message for StripeInvalidRequestError', () => {
		expect(safeStripeMessage({ type: 'StripeInvalidRequestError', message: 'No such price: price_x' })).toBe('No such price: price_x');
	});

	it('relays the message for StripeCardError', () => {
		expect(safeStripeMessage({ type: 'StripeCardError', message: 'Your card was declined.' })).toBe('Your card was declined.');
	});

	it('scrubs the message for StripeAuthenticationError', () => {
		const msg = safeStripeMessage({ type: 'StripeAuthenticationError', message: 'Invalid API Key provided: sk_live_****' });
		expect(msg).toBe('The payment provider rejected the request.');
		expect(msg).not.toContain('sk_live');
	});

	it('scrubs the message for an unknown / untyped error', () => {
		expect(safeStripeMessage({ message: 'internal detail' })).toBe('The payment provider rejected the request.');
		expect(safeStripeMessage({ type: 'StripeConnectionError', message: 'connect ECONNREFUSED 10.0.0.5:443' })).toBe(
			'The payment provider rejected the request.',
		);
	});

	it('falls back to the generic string when a safe type carries no message', () => {
		expect(safeStripeMessage({ type: 'StripeInvalidRequestError' })).toBe('The payment provider rejected the request.');
	});
});

describe('stripeErrorResponse', () => {
	async function bodyOf(res: Response): Promise<{ ok: boolean; error: { code: string; message?: string } }> {
		return (await res.json()) as { ok: boolean; error: { code: string; message?: string } };
	}

	it('maps 404 to NOT_FOUND with the resource hint', async () => {
		const res = stripeErrorResponse({ statusCode: 404 } as IApiUpstreamError, origin, env, 'product:prod_1');
		expect(res.status).toBe(404);
		const body = await bodyOf(res);
		expect(body.error.code).toBe('NOT_FOUND');
		expect((body.error as { resource?: string }).resource).toBe('product:prod_1');
	});

	it('maps a StripeInvalidRequestError (<500) to BAD_REQUEST and relays the safe message', async () => {
		const res = stripeErrorResponse(
			{ statusCode: 400, type: 'StripeInvalidRequestError', message: 'No such price: price_x' } as IApiUpstreamError,
			origin,
			env,
		);
		expect(res.status).toBe(400);
		const body = await bodyOf(res);
		expect(body.error.code).toBe('BAD_REQUEST');
		expect(body.error.message).toBe('No such price: price_x');
	});

	it('maps a StripeAuthenticationError (401) to BAD_REQUEST but scrubs the message', async () => {
		const res = stripeErrorResponse(
			{ statusCode: 401, type: 'StripeAuthenticationError', message: 'Invalid API Key provided: sk_live_****' } as IApiUpstreamError,
			origin,
			env,
		);
		expect(res.status).toBe(400);
		const body = await bodyOf(res);
		expect(body.error.code).toBe('BAD_REQUEST');
		expect(body.error.message).toBe('The payment provider rejected the request.');
		expect(body.error.message).not.toContain('sk_live');
	});

	it('maps >=500 to INTERNAL with no leaked message', async () => {
		const res = stripeErrorResponse({ statusCode: 500, message: 'Internal server error details' } as IApiUpstreamError, origin, env);
		expect(res.status).toBe(500);
		const body = await bodyOf(res);
		expect(body.error.code).toBe('INTERNAL');
		expect(body.error.message).toBeUndefined();
	});

	it('defaults a missing statusCode to 500 INTERNAL', async () => {
		const res = stripeErrorResponse(new Error('boom'), origin, env);
		expect(res.status).toBe(500);
		const body = await bodyOf(res);
		expect(body.error.code).toBe('INTERNAL');
	});
});
