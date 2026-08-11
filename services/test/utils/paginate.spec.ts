import { describe, it, expect } from 'vitest';
import { paginateArray } from '../../src/utils/paginate';

describe('paginateArray', () => {
	const items = [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }];

	it('returns the first page when no cursor is given', () => {
		const r = paginateArray(items, 2);
		expect(r.data).toEqual([{ id: 'a' }, { id: 'b' }]);
		expect(r.hasMore).toBe(true);
	});

	it('returns the next page when a known cursor is given', () => {
		const r = paginateArray(items, 2, 'b');
		expect(r.data).toEqual([{ id: 'c' }, { id: 'd' }]);
		expect(r.hasMore).toBe(false);
	});

	it('reports hasMore: false on the last page', () => {
		const r = paginateArray(items, 10);
		expect(r.data).toHaveLength(4);
		expect(r.hasMore).toBe(false);
	});

	it('returns empty + hasMore:false when items is empty', () => {
		expect(paginateArray([] as Array<{ id: string }>, 5)).toEqual({ data: [], hasMore: false });
	});

	it('returns empty + hasMore:false when starting_after is not found (review I5)', () => {
		// Previously the function silently fell through to "return the first page",
		// which means a stale or tampered cursor produced a duplicate of page 1
		// instead of an honest "no more results" signal.
		const r = paginateArray(items, 2, 'ghost');
		expect(r).toEqual({ data: [], hasMore: false });
	});
});
