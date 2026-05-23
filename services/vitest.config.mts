import { defineWorkersConfig } from '@cloudflare/vitest-pool-workers/config';

export default defineWorkersConfig({
	test: {
		poolOptions: {
			workers: {
				wrangler: { configPath: './wrangler.jsonc' },
			},
		},
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
