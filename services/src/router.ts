import checkoutHandler from './stripe/checkout/stripe-checkout';
import createProductHandler from './stripe/product/create-product';
import getProductsHandler from './stripe/product/get-products';
import updateProductHandler from './stripe/product/update-product';
import deleteProductHandler from './stripe/product/delete-product';
import { jsonResponse } from './utils';

export const router = async (request: Request, env: Env): Promise<Response> => {
	const url = new URL(request.url);
	const pathname = url.pathname;

	// Route: /checkout (Stripe checkout session creation)
	if (pathname === '/checkout' || pathname === '/checkout/') {
		return checkoutHandler.fetch(request, env);
	}

	// Route: /products (Product CRUD operations)
	if (pathname === '/products' || pathname === '/products/') {
		if (['POST', 'GET', 'OPTIONS'].includes(request.method)) {
			return createProductHandler.fetch(request, env); // createProductHandler handles POST, getProductsHandler handles GET via withStripeHandler
		}
		if (request.method === 'POST') {
			return createProductHandler.fetch(request, env);
		}
		if (request.method === 'GET') {
			return getProductsHandler.fetch(request, env);
		}
		return jsonResponse({ error: 'Method not allowed' }, 405);
	}

	// Route: /products/:id (Product operations by ID)
	const productIdMatch = pathname.match(/^\/products\/([^/]+)$/);
	if (productIdMatch) {
		if (['PUT', 'DELETE', 'GET', 'OPTIONS'].includes(request.method)) {
			if (request.method === 'PUT') {
				return updateProductHandler.fetch(request, env);
			}
			if (request.method === 'DELETE') {
				return deleteProductHandler.fetch(request, env);
			}
			if (request.method === 'GET') {
				return getProductsHandler.fetch(request, env);
			}
		}
		return jsonResponse({ error: 'Method not allowed' }, 405);
	}

	return jsonResponse({ error: 'Not found' }, 404);
};

export default router;
