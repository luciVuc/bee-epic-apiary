import checkoutHandler from './stripe/checkout/stripe-checkout';
import createProductHandler from './stripe/product/create-product';
import getProductsHandler from './stripe/product/get-products';
import getProductsCountHandler from './stripe/product/get-products-count';
import updateProductHandler from './stripe/product/update-product';
import deleteProductHandler from './stripe/product/delete-product';
import createPriceHandler from './stripe/price/create-price';
import getOrdersHandler from './stripe/order/get-orders';
import updateOrderHandler from './stripe/order/update-order';
import settingsHandler from './settings/settings-handler';
import confirmOrderHandler from './stripe/order/confirm-order';
import notificationsStreamHandler from './stripe/notifications/notifications-stream';
import contactHandler from './contact/contact-handler';
import { jsonResponse, handleCORS } from './utils';

/**
 * Main request router for the Cloudflare Worker.
 * Matches URL pathnames against known routes and delegates to the appropriate handler.
 * Handles CORS preflight, method validation, and authentication for protected routes.
 *
 * Routes:
 *   POST /checkout, POST /contact, POST /prices,
 *   GET|POST /products, GET /products/count, GET|PUT|DELETE /products/:id,
 *   GET|POST /orders/confirm, GET|PUT /orders/:id, GET /orders,
 *   GET /notifications/stream, GET|PUT /settings/:type
 *
 * @param request - Incoming HTTP request
 * @param env - Cloudflare Worker environment variables and bindings
 * @returns HTTP response
 */
export const router = async (request: Request, env: Env): Promise<Response> => {
	const url = new URL(request.url);
	const pathname = url.pathname;
	const origin = request.headers.get('Origin');

	// Route: /checkout
	if (pathname === '/checkout' || pathname === '/checkout/') {
		return checkoutHandler.fetch(request, env);
	}

	// Route: /contact (public)
	if (pathname === '/contact' || pathname === '/contact/') {
		return contactHandler.fetch(request, env);
	}

	// Route: /prices
	if (pathname === '/prices' || pathname === '/prices/') {
		if (request.method === 'POST') return createPriceHandler.fetch(request, env);
		if (request.method === 'OPTIONS') return createPriceHandler.fetch(request, env);
		return jsonResponse({ error: 'Method not allowed' }, 405, origin, env);
	}

	// Route: /products
	if (pathname === '/products' || pathname === '/products/') {
		if (request.method === 'POST') return createProductHandler.fetch(request, env);
		if (request.method === 'GET') return getProductsHandler.fetch(request, env);
		if (request.method === 'OPTIONS') return createProductHandler.fetch(request, env);
		return jsonResponse({ error: 'Method not allowed' }, 405, origin, env);
	}

	// Route: /products/count
	if (pathname === '/products/count' || pathname === '/products/count/') {
		if (request.method === 'GET') return getProductsCountHandler.fetch(request, env);
		if (request.method === 'OPTIONS') return getProductsCountHandler.fetch(request, env);
		return jsonResponse({ error: 'Method not allowed' }, 405, origin, env);
	}

	// Route: /products/:id
	const productIdMatch = pathname.match(/^\/products\/([^/]+)$/);
	if (productIdMatch) {
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

	// Route: /orders/confirm (public — must precede /orders/:id regex)
	if (pathname === '/orders/confirm' || pathname === '/orders/confirm/') {
		if (request.method === 'POST') return confirmOrderHandler.fetch(request, env);
		if (request.method === 'OPTIONS') return handleCORS(request, env, 'POST');
		return jsonResponse({ error: 'Method not allowed' }, 405, origin, env);
	}

	// Route: /notifications/stream (SSE — must precede generic catch-all below)
	if (pathname === '/notifications/stream' || pathname === '/notifications/stream/') {
		if (request.method === 'OPTIONS') return handleCORS(request, env, 'GET');
		if (request.method !== 'GET') return jsonResponse({ error: 'Method not allowed' }, 405, origin, env);
		return notificationsStreamHandler.fetch(request, env);
	}

	// Route: /orders
	if (pathname === '/orders' || pathname === '/orders/') {
		if (request.method === 'GET') return getOrdersHandler.fetch(request, env);
		if (request.method === 'OPTIONS') return getOrdersHandler.fetch(request, env);
		return jsonResponse({ error: 'Method not allowed' }, 405, origin, env);
	}

	// Route: /orders/:id
	const orderIdMatch = pathname.match(/^\/orders\/([^/]+)$/);
	if (orderIdMatch) {
		if (request.method === 'GET') return getOrdersHandler.fetch(request, env);
		if (request.method === 'PUT') return updateOrderHandler.fetch(request, env);
		if (request.method === 'OPTIONS') {
			const response = handleCORS(request, env, 'OPTIONS');
			response.headers.set('Access-Control-Allow-Methods', 'GET, PUT, OPTIONS');
			return response;
		}
		return jsonResponse({ error: 'Method not allowed' }, 405, origin, env);
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
			const response = handleCORS(request, env, 'OPTIONS');
			response.headers.set('Access-Control-Allow-Methods', 'GET, PUT, OPTIONS');
			return response;
		}
		return jsonResponse({ error: 'Method not allowed' }, 405, origin, env);
	}

	return jsonResponse({ error: 'Not found' }, 404, origin, env);
};

export default router;
