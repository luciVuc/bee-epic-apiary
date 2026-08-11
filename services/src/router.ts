import acceptInviteHandler from './auth/handlers/acceptInvite';
import bootstrapOwnerHandler from './auth/handlers/bootstrapOwner';
import changePasswordHandler from './auth/handlers/changePassword';
import completeResetHandler from './auth/handlers/completeReset';
import deleteUserHandler from './auth/handlers/deleteUser';
import inviteUserHandler from './auth/handlers/inviteUser';
import listUsersHandler from './auth/handlers/listUsers';
import loginHandler from './auth/handlers/login';
import logoutHandler from './auth/handlers/logout';
import { getPolicyHandler, putPolicyHandler } from './auth/handlers/policyHandlers';
import refreshHandler from './auth/handlers/refresh';
import reinviteUserHandler from './auth/handlers/reinviteUser';
import requestResetHandler from './auth/handlers/requestReset';
import updateMeHandler from './auth/handlers/updateMe';
import updateUserHandler from './auth/handlers/updateUser';
import whoamiHandler from './auth/handlers/whoami';
import checkoutHandler from './stripe/checkout/stripe-checkout';
import createProductHandler from './stripe/product/create-product';
import getProductsHandler from './stripe/product/get-products';
import getProductsCountHandler from './stripe/product/get-products-count';
import getProductsStatsHandler from './stripe/product/get-products-stats';
import updateProductHandler from './stripe/product/update-product';
import deleteProductHandler from './stripe/product/delete-product';
import cleanupProductsHandler from './stripe/product/cleanup-products';
import createPriceHandler from './stripe/price/create-price';
import getOrdersHandler from './stripe/order/get-orders';
import updateOrderHandler from './stripe/order/update-order';
import settingsHandler from './settings/settings-handler';
import notificationsStreamHandler from './stripe/notifications/notifications-stream';
import contactHandler from './contact/contact-handler';
import webhookHandler from './stripe/webhook/webhook-handler';
import { jsonErr, handleCORS } from './utils';

/**
 * Main request router for the Cloudflare Worker.
 * Matches URL pathnames against known routes and delegates to the appropriate handler.
 * Handles CORS preflight, method validation, and authentication for protected routes.
 *
 * Routes:
 *   POST /stripe/webhook, POST /checkout, POST /contact, POST /prices,
 *   POST /auth/accept-invite, POST /auth/bootstrap-owner, POST /auth/change-password,
 *   POST /auth/complete-reset, POST /auth/login, POST /auth/logout,
 *   POST /auth/refresh, POST /auth/request-reset,
 *   GET|POST /products, GET /products/count, GET /products/stats, POST /products/cleanup, GET|PUT|DELETE /products/:id,
 *   GET|PUT /orders/:id, GET /orders,
 *   GET /users, POST /users/invite, PUT /users/me, POST /users/:email/reinvite,
 *   PUT|DELETE /users/:email,
 *   GET|PUT /settings/auth-policy,
 *   GET /notifications/stream, GET|PUT /settings/:type, GET /whoami
 *
 * @param request - Incoming HTTP request
 * @param env - Cloudflare Worker environment variables and bindings
 * @returns HTTP response
 */
export const router = async (request: Request, env: Env): Promise<Response> => {
	const url = new URL(request.url);
	const pathname = url.pathname;
	const origin = request.headers.get('Origin');

	// Route: /stripe/webhook (public — Stripe server-to-server, no CORS)
	if (pathname === '/stripe/webhook' || pathname === '/stripe/webhook/') {
		return webhookHandler.fetch(request, env);
	}

	// Route: /checkout
	if (pathname === '/checkout' || pathname === '/checkout/') {
		return checkoutHandler.fetch(request, env);
	}

	// ============================================================================
	// Auth routes — /auth/*
	//
	// Each handler self-wraps with `withAuthHandler` (see services/src/auth/handlers/*).
	// OPTIONS preflight is handled inside the wrapper via handleCORS. Any non-POST
	// method (other than OPTIONS) returns 405.
	// ============================================================================

	// Route: /auth/accept-invite
	if (pathname === '/auth/accept-invite' || pathname === '/auth/accept-invite/') {
		if (request.method === 'POST') return acceptInviteHandler.fetch(request, env);
		if (request.method === 'OPTIONS') return acceptInviteHandler.fetch(request, env);
		return jsonErr({ code: 'METHOD_NOT_ALLOWED', allowed: ['POST', 'OPTIONS'] }, origin, env);
	}

	// Route: /auth/bootstrap-owner
	if (pathname === '/auth/bootstrap-owner' || pathname === '/auth/bootstrap-owner/') {
		if (request.method === 'POST') return bootstrapOwnerHandler.fetch(request, env);
		if (request.method === 'OPTIONS') return bootstrapOwnerHandler.fetch(request, env);
		return jsonErr({ code: 'METHOD_NOT_ALLOWED', allowed: ['POST', 'OPTIONS'] }, origin, env);
	}

	// Route: /auth/change-password
	if (pathname === '/auth/change-password' || pathname === '/auth/change-password/') {
		if (request.method === 'POST') return changePasswordHandler.fetch(request, env);
		if (request.method === 'OPTIONS') return changePasswordHandler.fetch(request, env);
		return jsonErr({ code: 'METHOD_NOT_ALLOWED', allowed: ['POST', 'OPTIONS'] }, origin, env);
	}

	// Route: /auth/complete-reset
	if (pathname === '/auth/complete-reset' || pathname === '/auth/complete-reset/') {
		if (request.method === 'POST') return completeResetHandler.fetch(request, env);
		if (request.method === 'OPTIONS') return completeResetHandler.fetch(request, env);
		return jsonErr({ code: 'METHOD_NOT_ALLOWED', allowed: ['POST', 'OPTIONS'] }, origin, env);
	}

	// Route: /auth/login
	if (pathname === '/auth/login' || pathname === '/auth/login/') {
		if (request.method === 'POST') return loginHandler.fetch(request, env);
		if (request.method === 'OPTIONS') return loginHandler.fetch(request, env);
		return jsonErr({ code: 'METHOD_NOT_ALLOWED', allowed: ['POST', 'OPTIONS'] }, origin, env);
	}

	// Route: /auth/logout
	if (pathname === '/auth/logout' || pathname === '/auth/logout/') {
		if (request.method === 'POST') return logoutHandler.fetch(request, env);
		if (request.method === 'OPTIONS') return logoutHandler.fetch(request, env);
		return jsonErr({ code: 'METHOD_NOT_ALLOWED', allowed: ['POST', 'OPTIONS'] }, origin, env);
	}

	// Route: /auth/refresh
	if (pathname === '/auth/refresh' || pathname === '/auth/refresh/') {
		if (request.method === 'POST') return refreshHandler.fetch(request, env);
		if (request.method === 'OPTIONS') return refreshHandler.fetch(request, env);
		return jsonErr({ code: 'METHOD_NOT_ALLOWED', allowed: ['POST', 'OPTIONS'] }, origin, env);
	}

	// Route: /auth/request-reset
	if (pathname === '/auth/request-reset' || pathname === '/auth/request-reset/') {
		if (request.method === 'POST') return requestResetHandler.fetch(request, env);
		if (request.method === 'OPTIONS') return requestResetHandler.fetch(request, env);
		return jsonErr({ code: 'METHOD_NOT_ALLOWED', allowed: ['POST', 'OPTIONS'] }, origin, env);
	}

	// Route: /contact (public)
	if (pathname === '/contact' || pathname === '/contact/') {
		return contactHandler.fetch(request, env);
	}

	// Route: /prices
	if (pathname === '/prices' || pathname === '/prices/') {
		if (request.method === 'POST') return createPriceHandler.fetch(request, env);
		if (request.method === 'OPTIONS') return createPriceHandler.fetch(request, env);
		return jsonErr({ code: 'METHOD_NOT_ALLOWED', allowed: ['POST', 'OPTIONS'] }, origin, env);
	}

	// Route: /products
	if (pathname === '/products' || pathname === '/products/') {
		if (request.method === 'POST') return createProductHandler.fetch(request, env);
		if (request.method === 'GET') return getProductsHandler.fetch(request, env);
		if (request.method === 'OPTIONS') return createProductHandler.fetch(request, env);
		return jsonErr({ code: 'METHOD_NOT_ALLOWED', allowed: ['GET', 'POST', 'OPTIONS'] }, origin, env);
	}

	// Route: /products/count
	if (pathname === '/products/count' || pathname === '/products/count/') {
		if (request.method === 'GET') return getProductsCountHandler.fetch(request, env);
		if (request.method === 'OPTIONS') return getProductsCountHandler.fetch(request, env);
		return jsonErr({ code: 'METHOD_NOT_ALLOWED', allowed: ['GET', 'OPTIONS'] }, origin, env);
	}

	// Route: /products/stats — aggregated dashboard counts (review I12)
	if (pathname === '/products/stats' || pathname === '/products/stats/') {
		if (request.method === 'GET') return getProductsStatsHandler.fetch(request, env);
		if (request.method === 'OPTIONS') return getProductsStatsHandler.fetch(request, env);
		return jsonErr({ code: 'METHOD_NOT_ALLOWED', allowed: ['GET', 'OPTIONS'] }, origin, env);
	}

	// Route: /products/cleanup — bulk-remove un-priced (unsellable) products.
	// Must precede the /products/:id match below so "cleanup" isn't read as an id.
	if (pathname === '/products/cleanup' || pathname === '/products/cleanup/') {
		if (request.method === 'POST') return cleanupProductsHandler.fetch(request, env);
		if (request.method === 'OPTIONS') return handleCORS(request, env, ['POST']);
		return jsonErr({ code: 'METHOD_NOT_ALLOWED', allowed: ['POST', 'OPTIONS'] }, origin, env);
	}

	// Route: /products/:id
	const productIdMatch = pathname.match(/^\/products\/([^/]+)$/);
	if (productIdMatch) {
		if (request.method === 'PUT') return updateProductHandler.fetch(request, env);
		if (request.method === 'DELETE') return deleteProductHandler.fetch(request, env);
		if (request.method === 'GET') return getProductsHandler.fetch(request, env);
		if (request.method === 'OPTIONS') {
			return handleCORS(request, env, ['GET', 'PUT', 'DELETE']);
		}
		return jsonErr({ code: 'METHOD_NOT_ALLOWED', allowed: ['GET', 'PUT', 'DELETE', 'OPTIONS'] }, origin, env);
	}

	// Route: /notifications/stream (SSE — must precede generic catch-all below)
	if (pathname === '/notifications/stream' || pathname === '/notifications/stream/') {
		if (request.method === 'OPTIONS') return handleCORS(request, env, 'GET');
		if (request.method !== 'GET') return jsonErr({ code: 'METHOD_NOT_ALLOWED', allowed: ['GET', 'OPTIONS'] }, origin, env);
		return notificationsStreamHandler.fetch(request, env);
	}

	// Route: /orders
	if (pathname === '/orders' || pathname === '/orders/') {
		if (request.method === 'GET') return getOrdersHandler.fetch(request, env);
		if (request.method === 'OPTIONS') return getOrdersHandler.fetch(request, env);
		return jsonErr({ code: 'METHOD_NOT_ALLOWED', allowed: ['GET', 'OPTIONS'] }, origin, env);
	}

	// Route: /orders/:id
	const orderIdMatch = pathname.match(/^\/orders\/([^/]+)$/);
	if (orderIdMatch) {
		if (request.method === 'GET') return getOrdersHandler.fetch(request, env);
		if (request.method === 'PUT') return updateOrderHandler.fetch(request, env);
		if (request.method === 'OPTIONS') {
			return handleCORS(request, env, ['GET', 'PUT']);
		}
		return jsonErr({ code: 'METHOD_NOT_ALLOWED', allowed: ['GET', 'PUT', 'OPTIONS'] }, origin, env);
	}

	// Route: /settings/auth-policy — MUST precede /settings/:type regex.
	if (pathname === '/settings/auth-policy' || pathname === '/settings/auth-policy/') {
		if (request.method === 'GET') return getPolicyHandler.fetch(request, env);
		if (request.method === 'PUT') return putPolicyHandler.fetch(request, env);
		if (request.method === 'OPTIONS') return handleCORS(request, env, ['GET', 'PUT']);
		return jsonErr({ code: 'METHOD_NOT_ALLOWED', allowed: ['GET', 'PUT', 'OPTIONS'] }, origin, env);
	}

	// Route: /users — list
	if (pathname === '/users' || pathname === '/users/') {
		if (request.method === 'GET') return listUsersHandler.fetch(request, env);
		if (request.method === 'OPTIONS') return listUsersHandler.fetch(request, env);
		return jsonErr({ code: 'METHOD_NOT_ALLOWED', allowed: ['GET', 'OPTIONS'] }, origin, env);
	}

	// Route: /users/invite — MUST precede /users/:email match
	if (pathname === '/users/invite' || pathname === '/users/invite/') {
		if (request.method === 'POST') return inviteUserHandler.fetch(request, env);
		if (request.method === 'OPTIONS') return inviteUserHandler.fetch(request, env);
		return jsonErr({ code: 'METHOD_NOT_ALLOWED', allowed: ['POST', 'OPTIONS'] }, origin, env);
	}

	// Route: /users/me — MUST precede /users/:email match
	if (pathname === '/users/me' || pathname === '/users/me/') {
		if (request.method === 'PUT') return updateMeHandler.fetch(request, env);
		if (request.method === 'OPTIONS') return updateMeHandler.fetch(request, env);
		return jsonErr({ code: 'METHOD_NOT_ALLOWED', allowed: ['PUT', 'OPTIONS'] }, origin, env);
	}

	// Route: /users/:email/reinvite — MUST precede /users/:email (single-segment)
	const reinviteMatch = pathname.match(/^\/users\/([^/]+)\/reinvite\/?$/);
	if (reinviteMatch) {
		if (request.method === 'POST') return reinviteUserHandler.fetch(request, env);
		if (request.method === 'OPTIONS') return reinviteUserHandler.fetch(request, env);
		return jsonErr({ code: 'METHOD_NOT_ALLOWED', allowed: ['POST', 'OPTIONS'] }, origin, env);
	}

	// Route: /users/:email
	const userEmailMatch = pathname.match(/^\/users\/([^/]+)\/?$/);
	if (userEmailMatch) {
		if (request.method === 'PUT') return updateUserHandler.fetch(request, env);
		if (request.method === 'DELETE') return deleteUserHandler.fetch(request, env);
		if (request.method === 'OPTIONS') return handleCORS(request, env, ['PUT', 'DELETE']);
		return jsonErr({ code: 'METHOD_NOT_ALLOWED', allowed: ['PUT', 'DELETE', 'OPTIONS'] }, origin, env);
	}

	// Route: /settings/:type
	const settingsMatch = pathname.match(/^\/settings\/(site|process|testimonials|categories)$/);
	if (settingsMatch) {
		if (request.method === 'GET') return settingsHandler.fetch(request, env);
		if (request.method === 'PUT') {
			const clonedRequest = new Request(request.clone());
			return settingsHandler.fetch(clonedRequest, env);
		}
		if (request.method === 'OPTIONS') {
			return handleCORS(request, env, ['GET', 'PUT']);
		}
		return jsonErr({ code: 'METHOD_NOT_ALLOWED', allowed: ['GET', 'PUT', 'OPTIONS'] }, origin, env);
	}

	// Route: /whoami — returns the resolved caller identity (or null if unauthenticated)
	//
	// Envelope policy (review M13): unauth callers get a 200 with
	//   { ok: true, data: { caller: null } }
	// NOT a 401. This is intentional. The admin SPA boot sequence calls
	// /whoami to decide between "show the login link" and "show the
	// authenticated UI" — surfacing 401s here would force the SPA to
	// special-case a not-yet-logged-in caller as an error, when the real
	// answer is just "you're not logged in yet, here's null". A 401 is
	// reserved for endpoints that require a caller; /whoami's contract is
	// "tell me who I am, including 'nobody'".
	//
	// Delegates to whoamiHandler, which self-wraps with `withAuthHandler(...,
	// { public: true })` so the Origin allow-list + rate-limit chain is applied
	// (and OPTIONS preflight handled) consistently with every other route.
	if (pathname === '/whoami' || pathname === '/whoami/') {
		return whoamiHandler.fetch(request, env);
	}

	return jsonErr({ code: 'NOT_FOUND', resource: pathname }, origin, env);
};

export default router;
