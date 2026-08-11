import { cloudflareTest } from '@cloudflare/vitest-pool-workers';
import { defineConfig } from 'vitest/config';

export default defineConfig({
	plugins: [
		cloudflareTest({
			wrangler: {
				configPath: './wrangler.jsonc',
				// Pin tests to the `env.development` block so `send_email.remote: false`
				// is used. Without this, the root config's `remote: true` forces
				// vitest-pool-workers to start a remote proxy session against
				// Cloudflare's API, which requires CLOUDFLARE_API_TOKEN — breaking
				// local test runs. CI keeps working because CI sets the token anyway,
				// but local devs can now `npm test` straight away.
				environment: 'development',
			},
			// SSE tests against the NotificationHub DO need streaming responses to
			// pass through stub.fetch — that requires keeping the worker isolate
			// alive between RPC calls. Single-worker mode does that.
			singleWorker: true,
		}),
	],
	test: {
		setupFiles: ['./test/setup.ts'],
		// Some DO-backed tests (notification-hub SSE replay) wait on the worker
		// to flush a streamed response. Default 5s is tight under local pool-workers
		// overhead; bump to 15s so flaky runs stay deterministic.
		testTimeout: 15_000,
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
