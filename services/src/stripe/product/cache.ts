export async function invalidateProductCaches(request: Request): Promise<void> {
	const url = new URL(request.url);
	const baseUrl = `${url.origin}/products`;
	const cache = caches.default;

	const cacheKeys = [
		new Request(baseUrl, { method: 'GET' }),
		new Request(`${baseUrl}/count`, { method: 'GET' }),
		new Request(`${baseUrl}?expand[]=data.default_price`, { method: 'GET' }),
	];

	await Promise.all(cacheKeys.map((key) => cache.delete(key).catch(() => false)));
}
