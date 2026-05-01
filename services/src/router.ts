import checkoutHandler from './stripe/checkout/stripe-checkout';
import createProductHandler from './stripe/product/create-product';
import getProductsHandler from './stripe/product/get-products';
import updateProductHandler from './stripe/product/update-product';
import deleteProductHandler from './stripe/product/delete-product';
import { jsonResponse, handleCORS, checkAuth } from './utils';

/**
 * Routes incoming HTTP requests to the appropriate handler based on pathname and HTTP method.
 * Handles CORS preflight, authentication for protected routes, and method validation.
 *
 * @param {Request} request - The incoming HTTP request
 * @param {Env} env - Cloudflare Worker environment variables and bindings
 * @returns {Promise<Response>} The HTTP response from the matched handler
 *
 * @example
 * // Routes /checkout to checkout handler
 * // Routes /products to product handlers (with auth for POST)
 * // Routes /products/:id to product handlers (with auth for PUT, DELETE)
 */
export const router = async (request: Request, env: Env): Promise<Response> => {
	const url = new URL(request.url);
	const pathname = url.pathname;
	const origin = request.headers.get('Origin');

	// Route: /checkout (Stripe checkout session creation)
	if (pathname === '/checkout' || pathname === '/checkout/') {
		return checkoutHandler.fetch(request, env);
	}

	// Route: /products (Product CRUD operations)
	if (pathname === '/products' || pathname === '/products/') {
		// Check authentication for POST (create)
		if (request.method === 'POST') {
			const auth = checkAuth(request, env);
			if (!auth.authenticated) return auth.error!;
			return createProductHandler.fetch(request, env);
		}
		if (request.method === 'GET') return getProductsHandler.fetch(request, env);
		if (request.method === 'OPTIONS') return createProductHandler.fetch(request, env);
		return jsonResponse({ error: 'Method not allowed' }, 405, origin, env);
	}

	// Route: /products/:id (Product operations by ID)
	const productIdMatch = pathname.match(/^\/products\/([^/]+)$/);
	if (productIdMatch) {
		// Check authentication for PUT and DELETE
		if (request.method === 'PUT' || request.method === 'DELETE') {
			const auth = checkAuth(request, env);
			if (!auth.authenticated) return auth.error!;
		}
		if (request.method === 'PUT') return updateProductHandler.fetch(request, env);
		if (request.method === 'DELETE') return deleteProductHandler.fetch(request, env);
		if (request.method === 'GET') return getProductsHandler.fetch(request, env);
		if (request.method === 'OPTIONS') {
			const response = handleCORS(request, env, 'OPTIONS');
			response.headers.set('Access-Control-Allow-Methods', 'PUT, DELETE, GET, OPTIONS');
			return response;
		}
		return jsonResponse({ error: 'Method not allowed' }, 405, origin, env);
	}

	return jsonResponse({ error: 'Not found' }, 404, origin, env);
};

export default router;
