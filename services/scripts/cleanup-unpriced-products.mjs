#!/usr/bin/env node
/**
 * Cleanup un-priced products from Stripe.
 *
 * Un-priced products (no `default_price`) are never sellable and are dropped by
 * the storefront transform (web/src/utils/transform.ts), yet they still inflate
 * Stripe's raw `total_count`. Left-over Stripe CLI test products ("myproduct",
 * "Test Product") are the usual culprits. This script removes them.
 *
 * For each candidate it attempts a permanent delete; Stripe refuses to delete a
 * product that has a price with transaction history, so on failure it falls back
 * to archiving (active=false) — which excludes it from the storefront just the same.
 *
 * Usage:
 *   node scripts/cleanup-unpriced-products.mjs            # dry-run (default): lists candidates
 *   node scripts/cleanup-unpriced-products.mjs --apply    # delete/archive the candidates
 *   node scripts/cleanup-unpriced-products.mjs --apply --live   # allow a live (sk_live_) key
 *
 * STRIPE_SECRET_KEY is read from the environment first, then from services/.dev.vars.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const STRIPE_API = 'https://api.stripe.com/v1';

const args = new Set(process.argv.slice(2));
const APPLY = args.has('--apply');
const ALLOW_LIVE = args.has('--live');

function loadKey() {
	if (process.env.STRIPE_SECRET_KEY) return process.env.STRIPE_SECRET_KEY;
	const here = dirname(fileURLToPath(import.meta.url));
	const devVarsPath = join(here, '..', '.dev.vars');
	try {
		const contents = readFileSync(devVarsPath, 'utf8');
		for (const line of contents.split('\n')) {
			const match = line.match(/^\s*STRIPE_SECRET_KEY\s*=\s*(.+)\s*$/);
			if (match) return match[1].trim();
		}
	} catch {
		// fall through to the error below
	}
	return null;
}

/** Minimal Stripe REST helper using Basic auth (secret key as username). */
async function stripe(method, path, key, body) {
	const init = {
		method,
		headers: { Authorization: `Basic ${Buffer.from(`${key}:`).toString('base64')}` },
	};
	if (body) {
		init.headers['Content-Type'] = 'application/x-www-form-urlencoded';
		init.body = new URLSearchParams(body).toString();
	}
	const res = await fetch(`${STRIPE_API}${path}`, init);
	const json = await res.json();
	if (!res.ok) {
		const err = new Error(json?.error?.message || `Stripe ${method} ${path} failed (${res.status})`);
		err.stripe = json?.error;
		throw err;
	}
	return json;
}

/** Page through all active products, expanding default_price so we can spot un-priced ones. */
async function listUnpricedProducts(key) {
	const unpriced = [];
	let startingAfter;
	for (;;) {
		const params = new URLSearchParams({ limit: '100', active: 'true' });
		params.append('expand[]', 'data.default_price');
		if (startingAfter) params.set('starting_after', startingAfter);
		const page = await stripe('GET', `/products?${params.toString()}`, key);
		for (const product of page.data) {
			if (!product.default_price) unpriced.push(product);
		}
		if (!page.has_more) break;
		startingAfter = page.data[page.data.length - 1]?.id;
		if (!startingAfter) break;
	}
	return unpriced;
}

async function main() {
	const key = loadKey();
	if (!key) {
		console.error('✖ STRIPE_SECRET_KEY not found (checked env and services/.dev.vars).');
		process.exit(1);
	}
	if (!key.startsWith('sk_test_') && !ALLOW_LIVE) {
		console.error('✖ Refusing to run against a non-test key without --live. Aborting.');
		process.exit(1);
	}

	const mode = APPLY ? 'APPLY' : 'DRY-RUN';
	console.log(`Cleanup un-priced products [${mode}]${key.startsWith('sk_live_') ? ' (LIVE MODE)' : ''}\n`);

	const candidates = await listUnpricedProducts(key);
	console.log(`Found ${candidates.length} un-priced product(s):`);
	for (const p of candidates) {
		console.log(`  ${p.id}  ${p.name}`);
	}
	if (candidates.length === 0) {
		console.log('\nNothing to clean up. ✔');
		return;
	}

	if (!APPLY) {
		console.log('\nDry-run — nothing deleted. Re-run with --apply to remove these.');
		return;
	}

	let deleted = 0;
	let archived = 0;
	const failed = [];
	for (const p of candidates) {
		try {
			const res = await stripe('DELETE', `/products/${p.id}`, key);
			if (res.deleted) {
				deleted++;
			} else {
				// Unexpected shape — treat as failure so it's visible.
				failed.push({ id: p.id, error: 'delete returned deleted=false' });
			}
		} catch (delErr) {
			// Stripe refuses to delete products with price/transaction history.
			// Fall back to archiving, which also removes them from the storefront.
			try {
				await stripe('POST', `/products/${p.id}`, key, { active: 'false' });
				archived++;
				console.log(`  archived (delete refused): ${p.id}`);
			} catch (archiveErr) {
				failed.push({ id: p.id, error: archiveErr.message || delErr.message });
			}
		}
	}

	console.log(`\nDone. deleted=${deleted} archived=${archived} failed=${failed.length}`);
	for (const f of failed) console.log(`  FAILED ${f.id}: ${f.error}`);
	if (failed.length > 0) process.exit(1);
}

main().catch((err) => {
	console.error('✖ Cleanup failed:', err.message);
	process.exit(1);
});
