/**
 * Slices a page out of `items`, honoring an optional Stripe-style `startingAfter`
 * cursor. When the cursor is provided but not found in `items`, returns an empty
 * page rather than falling back to page 1 — a stale or tampered cursor must
 * produce an honest "no more results" signal, not a duplicate first page
 * (review I5).
 */
export function paginateArray<T extends { id: string }>(
	items: T[],
	limit: number,
	startingAfter?: string,
): { data: T[]; hasMore: boolean } {
	if (startingAfter) {
		const startIndex = items.findIndex((item) => item.id === startingAfter);
		if (startIndex === -1) {
			return { data: [], hasMore: false };
		}
		const sliced = items.slice(startIndex + 1, startIndex + 1 + limit);
		return {
			data: sliced,
			hasMore: startIndex + 1 + limit < items.length,
		};
	}
	const sliced = items.slice(0, limit);
	return {
		data: sliced,
		hasMore: limit < items.length,
	};
}
