import { describe, it, expect, vi, beforeEach } from 'vitest';
import settingsHandler from '../../src/settings/settings-handler';
import { EStaffRole } from '../../src/types';
import { EUserStatus } from '@bee-epic/shared';
import { createUser } from '../../src/auth/repo/userRepo';

/** Build a minimal valid ISiteContent — matches every required field in the shared SiteContentSchema. */
function validSite() {
	return {
		businessName: 'Bee Epic Apiary',
		logo: '/logo.png',
		tagline: 'Best honey',
		heroHeadline: 'Headline',
		heroSubheadline: 'Subheadline',
		aboutTitle: 'About',
		aboutText: ['paragraph 1'],
		aboutImages: ['/about.jpg'],
		processTitle: 'Process',
		processSubtitle: 'Subtitle',
		productsTitle: 'Products',
		productsSubtitle: 'Subtitle',
		testimonialsTitle: 'Testimonials',
		testimonialsSubtitle: 'Subtitle',
		contactTitle: 'Contact',
		contactSubtitle: 'Subtitle',
		noProductsFound: 'None',
		footerTagline: 'Footer',
		yearsExperience: '10',
		yearsExperienceLabel: 'Years',
		rawNatural: 'Raw',
		rawNaturalLabel: 'Natural',
		californiaProud: 'CA',
		californiaProudLabel: 'Proud',
		sinceYear: '2010',
		sinceYearLabel: 'Since',
		navLinks: [{ id: 'home', label: 'Home' }],
		orderConfirmed: 'Thanks',
		orderConfirmationMessage: 'Your order',
		questionsContact: 'Questions?',
		continueShopping: 'Continue',
		categories: [{ id: 'HONEY', label: 'Honey' }],
		email: 'owner@example.com',
		phone: '555-0100',
		location: 'CA',
		socialLinks: {},
		stripePublishableKey: 'pk_test_xyz',
	};
}

describe('settings-handler', () => {
	const env = {
		CONTENT_KV: {
			get: vi.fn(),
			put: vi.fn(),
		} as unknown as KVNamespace,
		STRIPE_SECRET_KEY: 'sk_test_123',
		ALLOWED_ORIGINS: 'http://localhost:3000',
		API_SECRET_KEY: 'test-secret-key',
	} as any;

	beforeEach(() => {
		vi.restoreAllMocks();
		env.CONTENT_KV.get = vi.fn();
		env.CONTENT_KV.put = vi.fn();
	});

	it('returns 404 when path does not match settings pattern', async () => {
		const request = new Request('http://localhost/settings/invalid', {
			method: 'GET',
			headers: { Origin: 'http://localhost:3000' },
		});
		const response = await settingsHandler.fetch(request, env);
		expect(response.status).toBe(404);
	});

	it('returns NOT_FOUND for GET /settings/staff (endpoint removed in Phase 9.4)', async () => {
		const request = new Request('http://localhost/settings/staff', {
			method: 'GET',
			headers: { Origin: 'http://localhost:3000' },
		});
		const response = await settingsHandler.fetch(request, env);
		expect(response.status).toBe(404);
		const body = (await response.json()) as any;
		expect(body.ok).toBe(false);
		expect(body.error.code).toBe('NOT_FOUND');
	});

	it('returns 404 for GET when no content found', async () => {
		env.CONTENT_KV.get.mockResolvedValue(null);

		const request = new Request('http://localhost/settings/site', {
			method: 'GET',
			headers: { Origin: 'http://localhost:3000' },
		});
		const response = await settingsHandler.fetch(request, env);
		expect(response.status).toBe(404);
		const body = (await response.json()) as any;
		expect(body.ok).toBe(false);
		expect(body.error.code).toBe('NOT_FOUND');
	});

	it('returns 500 for GET when stored data is invalid JSON', async () => {
		env.CONTENT_KV.get.mockResolvedValue('not-valid-json');

		const request = new Request('http://localhost/settings/site', {
			method: 'GET',
			headers: { Origin: 'http://localhost:3000' },
		});
		const response = await settingsHandler.fetch(request, env);
		expect(response.status).toBe(500);
		const body = (await response.json()) as any;
		expect(body.ok).toBe(false);
		expect(body.error.code).toBe('INTERNAL');
	});

	it('returns 200 for GET with valid stored data', async () => {
		env.CONTENT_KV.get.mockResolvedValue(JSON.stringify({ name: 'Bee Epic' }));

		const request = new Request('http://localhost/settings/site', {
			method: 'GET',
			headers: { Origin: 'http://localhost:3000' },
		});
		const response = await settingsHandler.fetch(request, env);
		expect(response.status).toBe(200);
		const body = (await response.json()) as any;
		expect(body.ok).toBe(true);
		expect(body.data.name).toBe('Bee Epic');
	});

	it('returns 403 for PUT with disallowed origin', async () => {
		const request = new Request('http://localhost/settings/site', {
			method: 'PUT',
			headers: {
				'Content-Type': 'application/json',
				Origin: 'http://evil.com',
				Authorization: 'Bearer test-secret-key',
			},
			body: JSON.stringify({ name: 'Updated' }),
		});
		const response = await settingsHandler.fetch(request, { ...env, ALLOWED_ORIGINS: 'http://localhost:3000' });
		expect(response.status).toBe(403);
	});

	it('returns 401 for PUT without auth header when API_SECRET_KEY is set', async () => {
		const request = new Request('http://localhost/settings/site', {
			method: 'PUT',
			headers: {
				'Content-Type': 'application/json',
				Origin: 'http://localhost:3000',
			},
			body: JSON.stringify({ name: 'Updated' }),
		});
		const response = await settingsHandler.fetch(request, env);
		expect(response.status).toBe(401);
	});

	it('returns 405 for unsupported method', async () => {
		const request = new Request('http://localhost/settings/site', {
			method: 'DELETE',
			headers: { Origin: 'http://localhost:3000' },
		});
		const response = await settingsHandler.fetch(request, env);
		expect(response.status).toBe(405);
	});

	it('returns 400 for invalid JSON body on PUT', async () => {
		const request = new Request('http://localhost/settings/site', {
			method: 'PUT',
			headers: {
				'Content-Type': 'application/json',
				Origin: 'http://localhost:3000',
				Authorization: 'Bearer test-secret-key',
			},
			body: 'invalid-json',
		});
		const response = await settingsHandler.fetch(request, env);
		expect(response.status).toBe(400);
		const body = (await response.json()) as any;
		expect(body.ok).toBe(false);
		expect(body.error.code).toBe('BAD_REQUEST');
	});

	it('returns 200 for PUT with valid data (non-categories type)', async () => {
		const mockPut = vi.fn().mockResolvedValue(undefined);
		env.CONTENT_KV.put = mockPut;
		env.CONTENT_KV.get = vi.fn().mockResolvedValue(null);

		const request = new Request('http://localhost/settings/site', {
			method: 'PUT',
			headers: {
				'Content-Type': 'application/json',
				Origin: 'http://localhost:3000',
				Authorization: 'Bearer test-secret-key',
			},
			body: JSON.stringify(validSite()),
		});
		const response = await settingsHandler.fetch(request, env);
		expect(response.status).toBe(200);
		const body = (await response.json()) as any;
		expect(body.ok).toBe(true);
		// Handler returns the URL path segment verbatim (lowercase), not the enum value.
		expect(body.data.type).toBe('site');
	});

	it('returns 200 for PUT with valid categories data', async () => {
		const mockPut = vi.fn().mockResolvedValue(undefined);
		env.CONTENT_KV.put = mockPut;

		const request = new Request('http://localhost/settings/categories', {
			method: 'PUT',
			headers: {
				'Content-Type': 'application/json',
				Origin: 'http://localhost:3000',
				Authorization: 'Bearer test-secret-key',
			},
			body: JSON.stringify([
				{ id: 'HONEY', label: 'Honey' },
				{ id: 'BEESWAX', label: 'Beeswax' },
			]),
		});
		const response = await settingsHandler.fetch(request, env);
		expect(response.status).toBe(200);
		const body = (await response.json()) as any;
		expect(body.ok).toBe(true);
	});

	describe('role-based auth (Plan 3)', () => {
		const STAFF_LIST = [
			{ email: 'owner@test.com', role: EStaffRole.OWNER, invitedAt: 1000 },
			{ email: 'manager@test.com', role: EStaffRole.MANAGER, invitedAt: 2000 },
			{ email: 'fulfillment@test.com', role: EStaffRole.EMPLOYEE, invitedAt: 3000 },
		];

		/**
		 * User-record-backed KV mock. Under the Phase 9 trust chain,
		 * `resolveCaller` resolves dev-bypass callers through `userRepo`, not
		 * the legacy `staff` KV list — so we seed real `user:*` records via
		 * `createUser` on the returned KV.
		 */
		async function makeKvWithStaff(): Promise<KVNamespace> {
			const store = new Map<string, string>();
			const kv = {
				get: vi.fn(async (key: string) => store.get(key) ?? null),
				put: vi.fn(async (key: string, value: string) => {
					store.set(key, value);
				}),
				delete: vi.fn(async (key: string) => {
					store.delete(key);
				}),
				list: vi.fn(async ({ prefix }: { prefix: string; cursor?: string }) => {
					const all = [...store.keys()].filter((k) => k.startsWith(prefix)).map((name) => ({ name }));
					return { keys: all, list_complete: true, cursor: undefined };
				}),
				getWithMetadata: vi.fn(),
			} as unknown as KVNamespace;
			// Phase 9 auth records — resolveCaller looks users up here.
			const now = Date.now();
			for (const m of STAFF_LIST) {
				await createUser({ CONTENT_KV: kv } as unknown as Env, {
					schemaVersion: 1,
					email: m.email,
					displayName: m.email,
					role: m.role,
					status: EUserStatus.ACTIVE,
					passwordHash: null,
					createdAt: now,
					updatedAt: now,
					lastLoginAt: null,
					lastLoginIp: null,
				});
			}
			return kv;
		}

		it('allows MANAGER to PUT /settings/site via X-Dev-Email in dev mode', async () => {
			const devEnv = {
				...env,
				CONTENT_KV: await makeKvWithStaff(),
				ENVIRONMENT: 'development',
			} as any;
			const request = new Request('http://localhost/settings/site', {
				method: 'PUT',
				headers: {
					'Content-Type': 'application/json',
					Origin: 'http://localhost:3000',
					'X-Dev-Email': 'manager@test.com',
				},
				body: JSON.stringify(validSite()),
			});
			const response = await settingsHandler.fetch(request, devEnv);
			expect(response.status).toBe(200);
			const body = (await response.json()) as any;
			expect(body.ok).toBe(true);
			expect(body.data.type).toBe('site');
		});

		it('returns 403 FORBIDDEN with requiredRole=MANAGER when EMPLOYEE tries to PUT site', async () => {
			const devEnv = {
				...env,
				CONTENT_KV: await makeKvWithStaff(),
				ENVIRONMENT: 'development',
			} as any;
			const request = new Request('http://localhost/settings/site', {
				method: 'PUT',
				headers: {
					'Content-Type': 'application/json',
					Origin: 'http://localhost:3000',
					'X-Dev-Email': 'fulfillment@test.com',
				},
				body: JSON.stringify({ name: 'Bee Epic Apiary' }),
			});
			const response = await settingsHandler.fetch(request, devEnv);
			expect(response.status).toBe(403);
			const body = (await response.json()) as any;
			expect(body.ok).toBe(false);
			expect(body.error.code).toBe('FORBIDDEN');
			expect(body.error.requiredRole).toBe(EStaffRole.MANAGER);
		});

		it('returns 401 UNAUTHORIZED for PUT site with no caller path (dev disabled, no JWT, no bearer)', async () => {
			const noAuthEnv = {
				CONTENT_KV: await makeKvWithStaff(),
				STRIPE_SECRET_KEY: 'sk_test_123',
				ALLOWED_ORIGINS: 'http://localhost:3000',
				ENVIRONMENT: 'production',
			} as any;
			const request = new Request('http://localhost/settings/site', {
				method: 'PUT',
				headers: {
					'Content-Type': 'application/json',
					Origin: 'http://localhost:3000',
					'X-Dev-Email': 'manager@test.com', // should be ignored in production
				},
				body: JSON.stringify({ name: 'Bee Epic Apiary' }),
			});
			const response = await settingsHandler.fetch(request, noAuthEnv);
			expect(response.status).toBe(401);
		});
	});
});
