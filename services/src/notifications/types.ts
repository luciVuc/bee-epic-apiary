/**
 * Notification event type barrel.
 *
 * As of Plan 2, the canonical typed event union lives in
 * `@bee-epic/shared/notifications`. This file re-exports the types so the
 * existing imports across `services/src/` (notification-hub.ts and the
 * various notify() call sites) keep working unchanged. New code should
 * import from `@bee-epic/shared` directly.
 */

export type {
	INotificationEvent,
	INotificationEventInput,
	INewOrderEvent,
	IOrderStatusChangedEvent,
	IProductUpdatedEvent,
	IProductDeletedEvent,
} from '@bee-epic/shared';

export { ENotificationType, NotificationEventInputSchema } from '@bee-epic/shared';
