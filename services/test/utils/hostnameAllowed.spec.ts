import { describe, it, expect } from 'vitest';
import { hostnameAllowed } from '../../src/utils/hostnameAllowed';

describe('hostnameAllowed', () => {
	it('matches by origin, ignoring path/query', () => {
		expect(hostnameAllowed('https://shop.test/success?a=1', 'https://shop.test')).toBe(true);
	});

	it('rejects a protocol downgrade on an allowed host', () => {
		// http:// must not pass when only https:// is trusted.
		expect(hostnameAllowed('http://shop.test/success', 'https://shop.test')).toBe(false);
	});

	it('rejects an arbitrary port on an allowed host', () => {
		expect(hostnameAllowed('https://shop.test:1337/success', 'https://shop.test')).toBe(false);
	});

	it('returns false for hostname not in the allow list', () => {
		expect(hostnameAllowed('https://evil.test/success', 'https://shop.test')).toBe(false);
	});

	it('supports comma-separated lists', () => {
		expect(hostnameAllowed('https://admin.test/x', 'https://shop.test,https://admin.test')).toBe(true);
	});

	it('returns true for wildcard `*`', () => {
		expect(hostnameAllowed('https://anything.test/x', '*')).toBe(true);
	});

	it('returns false for invalid URL inputs', () => {
		expect(hostnameAllowed('not a url', 'https://shop.test')).toBe(false);
		expect(hostnameAllowed('', 'https://shop.test')).toBe(false);
	});

	it('skips malformed origin entries instead of throwing', () => {
		expect(hostnameAllowed('https://shop.test/x', 'not-a-url,https://shop.test')).toBe(true);
	});

	it('does NOT match by suffix — evil.shop.test should not pass for shop.test', () => {
		// hostname equality is exact; subdomain attacks won't slip through.
		expect(hostnameAllowed('https://evil.shop.test/x', 'https://shop.test')).toBe(false);
	});
});
