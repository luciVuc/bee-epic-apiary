import { X } from "lucide-react";
import type { IOrder } from "../../types/order";
import { formatPrice } from "../../utils/badgeClasses";

interface INotificationsPanelProps {
  isOpen: boolean;
  notifications: IOrder[];
  onClose: () => void;
  onSelect: (order: IOrder) => void;
}

export function NotificationsPanel({
  isOpen,
  notifications,
  onClose,
  onSelect,
}: INotificationsPanelProps) {
  if (!isOpen) return null;

  return (
    <>
      <div
        className="fixed inset-0 z-40"
        data-testid="notifications-panel_backdrop"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        className="fixed top-0 right-0 h-full w-80 bg-white shadow-xl z-50 transform transition-transform duration-300 translate-x-0 dark:bg-dark-950"
        role="dialog"
        aria-modal="true"
        aria-labelledby="notifications-panel_title"
        data-testid="notifications-panel"
      >
        <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
          <h2
            id="notifications-panel_title"
            className="text-lg font-semibold text-dark-900 py-1"
            data-testid="notifications-panel_title"
          >
            Notifications
          </h2>
          <button
            onClick={onClose}
            aria-label="Close notifications panel"
            data-testid="notifications-panel_close"
            className="p-1 hover:bg-gray-100 rounded-lg text-dark-600 dark:hover:bg-dark-200"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <div
          className="overflow-y-auto h-[calc(100%-57px)]"
          data-testid="notifications-panel_body"
        >
          {notifications.length === 0 ? (
            <p
              className="p-4 text-dark-400 text-center"
              data-testid="notifications-panel_empty"
            >
              No new notifications
            </p>
          ) : (
            <ul data-testid="notifications-panel_list">
              {notifications.map((order) => (
                <li key={order.id}>
                  <button
                    onClick={() => onSelect(order)}
                    data-testid="notifications-panel_item"
                    className="w-full text-left p-4 border-b border-gray-100 hover:bg-gray-50 transition-colors dark:border-gray-700 dark:hover:bg-dark-200"
                  >
                    <p className="font-medium text-dark-900 truncate">
                      {order.customerName ||
                        order.customerEmail ||
                        "Unknown customer"}
                    </p>
                    <p className="text-sm text-dark-400">
                      New order &middot; {formatPrice(order.amountTotal)}{" "}
                      {order.currency.toUpperCase()}
                    </p>
                    <p className="text-xs text-dark-500">
                      {new Date(order.created * 1000).toLocaleString()}
                    </p>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </>
  );
}
