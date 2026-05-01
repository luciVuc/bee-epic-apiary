import checkoutHandler from './stripe/checkout/stripe-checkout';
import createProductHandler from './stripe/product/create-product';
import getProductsHandler from './stripe/product/get-products';
import updateProductHandler from './stripe/product/update-product';
import deleteProductHandler from './stripe/product/delete-product';
import { jsonResponse, handleCORS } from './utils';

export const router = async (request: Request, env: Env): Promise<Response> => {
	const url = new URL(request.url);
	const pathname = url.pathname;

	// Route: /checkout (Stripe checkout session creation)
	if (pathname === '/checkout' || pathname === '/checkout/') {
		return checkoutHandler.fetch(request, env);
	}

	// Route: /products (Product CRUD operations)
	if (pathname === '/products' || pathname === '/products/') {
		if (request.method === 'POST') return createProductHandler.fetch(request, env);
		if (request.method === 'GET') return getProductsHandler.fetch(request, env);
		if (request.method === 'OPTIONS') return createProductHandler.fetch(request, env);
		return jsonResponse({ error: 'Method not allowed' }, 405);
	}

	// Route: /products/:id (Product operations by ID)
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
		return jsonResponse({ error: 'Method not allowed' }, 405);
	}

	return jsonResponse({ error: 'Not found' }, 404);
};

export default router;
