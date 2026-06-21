export function paginateArray<T extends { id: string }>(
	items: T[],
	limit: number,
	startingAfter?: string,
): { data: T[]; hasMore: boolean; lastId: string | null } {
	if (startingAfter) {
		const startIndex = items.findIndex((item) => item.id === startingAfter);
		if (startIndex !== -1) {
			const sliced = items.slice(startIndex + 1, startIndex + 1 + limit);
			return {
				data: sliced,
				hasMore: startIndex + 1 + limit < items.length,
				lastId: sliced[sliced.length - 1]?.id || null,
			};
		}
	}
	const sliced = items.slice(0, limit);
	return {
		data: sliced,
		hasMore: limit < items.length,
		lastId: sliced[sliced.length - 1]?.id || null,
	};
}
