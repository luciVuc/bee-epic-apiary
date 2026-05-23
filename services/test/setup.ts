import { vi } from 'vitest';

// Mock the Stripe module completely
const mockStripeInstance = {
	products: {
		create: vi.fn(),
		retrieve: vi.fn(),
		update: vi.fn(),
		list: vi.fn(),
	},
	prices: {
		create: vi.fn(),
		retrieve: vi.fn(),
		update: vi.fn(),
		list: vi.fn(),
	},
	checkout: {
		sessions: {
			create: vi.fn(),
		},
	},
};

// Mock the Stripe class constructor
const mockStripeClass = vi.fn().mockReturnValue(mockStripeInstance);
// Mock the createFetchHttpClient as a static method on the Stripe class
mockStripeClass.createFetchHttpClient = vi.fn().mockReturnValue({
	fetch: vi.fn(),
	request: vi.fn(),
});

vi.mock('stripe', () => {
	return {
		default: mockStripeClass,
		__esModule: true,
	};
});
