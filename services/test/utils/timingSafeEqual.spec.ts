import { describe, it, expect } from 'vitest';
import { timingSafeEqual } from '../../src/utils/timingSafeEqual';

describe('timingSafeEqual', () => {
	it('returns true for equal strings', () => {
		expect(timingSafeEqual('abc', 'abc')).toBe(true);
	});

	it('returns false for different strings of the same length', () => {
		expect(timingSafeEqual('abc', 'abd')).toBe(false);
	});

	it('returns false for strings of different lengths', () => {
		expect(timingSafeEqual('abc', 'abcd')).toBe(false);
	});

	it('returns true for two empty strings', () => {
		expect(timingSafeEqual('', '')).toBe(true);
	});

	it('returns false when only one side is empty', () => {
		expect(timingSafeEqual('', 'x')).toBe(false);
		expect(timingSafeEqual('x', '')).toBe(false);
	});

	it('handles unicode codepoints', () => {
		expect(timingSafeEqual('héllo', 'héllo')).toBe(true);
		expect(timingSafeEqual('héllo', 'hello')).toBe(false);
	});
});
