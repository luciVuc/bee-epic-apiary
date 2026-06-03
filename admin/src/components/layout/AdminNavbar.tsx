/** Fixed top navigation bar with mobile hamburger menu, dynamic title from settings, notifications panel, and user indicator */
import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Bell, User, Menu } from "lucide-react";
import * as api from "../../utils/api";
import type { ISiteContent } from "../../types/settings";
import type { IOrder } from "../../types/order";
import { ORDER_STATUS_CHANGED_EVENT } from "../../utils/constants";
import { NotificationsPanel } from "../notifications/NotificationsPanel";

export interface IAdminNavbarProps {
  /** Callback when the mobile hamburger menu button is clicked */
  onMenuClick?: () => void;
}

export function AdminNavbar({ onMenuClick }: IAdminNavbarProps) {
  const navigate = useNavigate();
  const [businessName, setBusinessName] = useState<string>("");
  const [isPanelOpen, setIsPanelOpen] = useState(false);
  const [notifications, setNotifications] = useState<IOrder[]>([]);

  useEffect(() => {
    api.api
      .getSettings<ISiteContent>("site")
      .then((site) => {
        if (site?.businessName) {
          setBusinessName(site.businessName);
        }
      })
      .catch(() => {});
  }, []);

  const fetchNotifications = useCallback(() => {
    api.api
      .getOrders({ order_status: "new", limit: 50 })
      .then((result) => {
        const sorted = [...result.orders].sort((a, b) => b.created - a.created);
        setNotifications(sorted);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetchNotifications();
  }, [fetchNotifications]);

  useEffect(() => {
    const handleOrderStatusChange = () => {
      fetchNotifications();
    };
    window.addEventListener(
      ORDER_STATUS_CHANGED_EVENT,
      handleOrderStatusChange,
    );
    return () => {
      window.removeEventListener(
        ORDER_STATUS_CHANGED_EVENT,
        handleOrderStatusChange,
      );
    };
  }, [fetchNotifications]);

  const title = businessName ? `${businessName} Admin` : "Admin";
  const hasNotifications = notifications.length > 0;

  const handleSelectNotification = (order: IOrder) => {
    setIsPanelOpen(false);
    navigate(`/orders/${order.id}`);
  };

  return (
    <>
      <header
        className="fixed top-0 left-0 right-0 z-30 bg-white border-b border-gray-200 px-4 md:px-6 py-4 lg:left-64"
        data-testid="admin-navbar"
      >
        <div
          data-testid="admin-navbar_content"
          className="flex items-center justify-between"
        >
          {/* Mobile menu button */}
          <button
            onClick={onMenuClick}
            aria-label="Toggle navigation menu"
            title="Toggle navigation menu"
            className="lg:hidden p-2 hover:bg-gray-100 rounded-lg"
            data-testid="admin-navbar_menu-btn"
          >
            <Menu className="w-5 h-5" />
          </button>

          <div
            data-testid="admin-navbar_title-mobile"
            className="lg:hidden"
            aria-hidden="true"
          >
            <h1
              className="font-heading text-xl font-bold text-dark-900"
              data-testid="admin-navbar_title"
            >
              {title}
            </h1>
          </div>

          <div
            data-testid="admin-navbar_title-desktop"
            className="hidden lg:block"
          >
            <h1
              className="font-heading text-2xl font-bold text-dark-900"
              data-testid="admin-navbar_title"
            >
              {title}
            </h1>
          </div>

          <div
            data-testid="admin-navbar_actions"
            className="flex items-center gap-4"
          >
            <button
              onClick={() => setIsPanelOpen(true)}
              aria-label="Notifications"
              title="Notifications"
              data-testid="admin-navbar_notifications"
              className="relative p-2 text-dark-600 hover:bg-gray-100 rounded-lg"
            >
              <Bell
                data-testid="admin-navbar_notification-icon"
                className="w-5 h-5"
              />
              {hasNotifications && (
                <span
                  data-testid="admin-navbar_notification-badge"
                  className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full"
                ></span>
              )}
            </button>
            <div
              className="flex items-center gap-2 px-3 py-2 bg-gray-100 rounded-lg"
              data-testid="admin-navbar_user"
            >
              <User
                data-testid="admin-navbar_user-icon"
                className="w-5 h-5 text-dark-600"
              />
              <span
                className="text-sm font-medium text-dark-700 hidden md:block"
                data-testid="admin-navbar_user-name"
              >
                Admin
              </span>
            </div>
          </div>
        </div>
      </header>

      <NotificationsPanel
        isOpen={isPanelOpen}
        notifications={notifications}
        onClose={() => setIsPanelOpen(false)}
        onSelect={handleSelectNotification}
      />
    </>
  );
}
