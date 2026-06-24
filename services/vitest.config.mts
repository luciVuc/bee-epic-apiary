import { cloudflareTest } from '@cloudflare/vitest-pool-workers';
import { defineConfig } from 'vitest/config';

export default defineConfig({
	plugins: [
		cloudflareTest({
			wrangler: { configPath: './wrangler.jsonc' },
		}),
	],
	test: {
		setupFiles: ['./test/setup.ts'],
		coverage: {
			provider: 'istanbul',
			reporter: ['text', 'json', 'html'],
			thresholds: {
				lines: 90,
				branches: 90,
				functions: 90,
				statements: 90,
			},
			include: ['src/**/*.ts'],
			exclude: ['src/**/*.spec.ts', 'src/**/*.test.ts'],
		},
	},
});
