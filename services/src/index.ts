/**
 * Bee Epic Apiary - Stripe Services Cloudflare Worker
 *
 * Entry point for the Cloudflare Worker that provides Stripe checkout and product management APIs.
 * Exports the default fetch handler that routes all incoming requests to the router.
 *
 * @module index
 */

import router from './router';
import { NotificationHub } from './notifications/notification-hub';

export { NotificationHub };

/**
 * Default export for Cloudflare Worker
 * @type {ExportedHandler<Env>}
 */
export default {
	fetch: router,
} satisfies ExportedHandler<Env>;
