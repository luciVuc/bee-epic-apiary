import { describe, it, expect } from 'vitest';
import { truncateIp } from '../../../src/auth/policy/truncateIp';

describe('truncateIp', () => {
	describe('IPv4', () => {
		it('truncates a canonical IPv4 to /24', () => {
			expect(truncateIp('1.2.3.4')).toBe('1.2.3.0');
		});

		it('zeroes only the final octet when the third octet is already 0', () => {
			expect(truncateIp('192.168.0.1')).toBe('192.168.0.0');
		});

		it('returns "unknown" for a 3-octet input', () => {
			expect(truncateIp('1.2.3')).toBe('unknown');
		});

		it('returns "unknown" for a 5-octet input', () => {
			expect(truncateIp('1.2.3.4.5')).toBe('unknown');
		});

		it('returns "unknown" when an octet exceeds 255', () => {
			expect(truncateIp('1.2.3.256')).toBe('unknown');
		});

		it('returns "unknown" for non-numeric octets', () => {
			expect(truncateIp('a.b.c.d')).toBe('unknown');
		});

		it('returns "unknown" for an empty string', () => {
			expect(truncateIp('')).toBe('unknown');
		});
	});

	describe('IPv6', () => {
		it('truncates a fully-uncompressed IPv6 to /64', () => {
			expect(truncateIp('2001:db8:1:2:3:4:5:6')).toBe('2001:db8:1:2::');
		});

		it('truncates a compressed IPv6 with ≥4 concrete groups on the left', () => {
			expect(truncateIp('2001:db8:1:2::5:6')).toBe('2001:db8:1:2::');
		});

		it('handles an already-/64-truncated input as an identity op', () => {
			expect(truncateIp('2001:db8:1:2::')).toBe('2001:db8:1:2::');
		});

		it('fails closed on loopback "::1" (fewer than 4 concrete groups)', () => {
			expect(truncateIp('::1')).toBe('unknown');
		});

		it('fails closed on "fe80::1" (fewer than 4 concrete groups)', () => {
			expect(truncateIp('fe80::1')).toBe('unknown');
		});

		it('fails closed on "2001:db8::" (fewer than 4 concrete groups on the left)', () => {
			expect(truncateIp('2001:db8::')).toBe('unknown');
		});

		it('fails closed on the unspecified "::" address', () => {
			expect(truncateIp('::')).toBe('unknown');
		});
	});

	describe('IPv4-mapped IPv6', () => {
		it('unwraps ::ffff:a.b.c.d and truncates as IPv4 /24', () => {
			expect(truncateIp('::ffff:1.2.3.4')).toBe('1.2.3.0');
		});

		it('unwraps ::FFFF:a.b.c.d case-insensitively', () => {
			expect(truncateIp('::FFFF:10.0.0.1')).toBe('10.0.0.0');
		});
	});

	describe('sentinels + garbage', () => {
		it('returns "unknown" for the "unknown" sentinel (self-round-trip)', () => {
			expect(truncateIp('unknown')).toBe('unknown');
		});

		it('returns "unknown" for arbitrary non-IP strings', () => {
			expect(truncateIp('not-an-ip')).toBe('unknown');
		});
	});
});
