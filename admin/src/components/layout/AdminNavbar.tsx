/** Fixed top navigation bar with mobile hamburger menu, dynamic title from settings, notifications panel, and user indicator */
import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Bell, User, Menu, Sun, Moon } from "lucide-react";
import { useTheme } from "../../hooks/useTheme";
import * as api from "../../utils/api";
import type { ISiteContent } from "../../types/settings";
import type { IOrder } from "../../types/order";
import {
  ORDER_STATUS_CHANGED_EVENT,
  NEW_ORDER_EVENT,
  DEFAULT_LOGO,
} from "../../utils/constants";
import { NotificationsPanel } from "../notifications/NotificationsPanel";

export interface IAdminNavbarProps {
  /** Callback when the mobile hamburger menu button is clicked */
  onMenuClick?: () => void;
}

export function AdminNavbar({ onMenuClick }: IAdminNavbarProps) {
  const navigate = useNavigate();
  const { isDark, toggleTheme } = useTheme();
  const [businessName, setBusinessName] = useState<string>("");
  const [logo, setLogo] = useState<string>("");
  const [isPanelOpen, setIsPanelOpen] = useState(false);
  const [notifications, setNotifications] = useState<IOrder[]>([]);

  useEffect(() => {
    api.api
      .getSettings<ISiteContent>("site")
      .then((site) => {
        if (site?.businessName) {
          setBusinessName(site.businessName);
        }
        if (site?.logo) {
          setLogo(site.logo);
        }
      })
      .catch(() => {});
  }, []);

  const fetchNotifications = useCallback(() => {
    api.api
      .getOrders({ order_status: "new", limit: 50, payment_status: "paid" })
      .then((result) => {
        const sorted = [...result.orders].sort((a, b) => b.created - a.created);
        setNotifications(sorted);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    const apiBaseUrl = import.meta.env.VITE_API_URL || "/api";
    const eventSource = new EventSource(`${apiBaseUrl}/notifications/stream`);

    eventSource.addEventListener("connected", () => {
      fetchNotifications();
    });

    eventSource.addEventListener("new-order", () => {
      fetchNotifications();
      window.dispatchEvent(new CustomEvent(NEW_ORDER_EVENT));
    });

    eventSource.addEventListener("error", () => {
      // EventSource will auto-reconnect
    });

    return () => {
      eventSource.close();
    };
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
        className="fixed top-0 left-0 right-0 z-30 bg-white dark:bg-dark-950 border-b border-gray-200 dark:border-dark-700 px-4 md:px-6 py-4 lg:left-64"
        data-testid="admin-navbar"
      >
        <div
          data-testid="admin-navbar_content"
          className="flex items-center justify-between"
        >
          <div
            data-testid="admin-navbar_branding"
            className="flex items-center gap-4"
          >
            <button
              onClick={onMenuClick}
              aria-label="Toggle navigation menu"
              title="Toggle navigation menu"
              className="lg:hidden p-2 hover:bg-gray-100 dark:hover:bg-dark-800 rounded-lg"
              data-testid="admin-navbar_menu-btn"
            >
              <Menu className="w-5 h-5" />
            </button>

            <div
              data-testid="admin-navbar_title-mobile"
              className="md:hidden flex items-center self-start gap-2"
              aria-hidden="true"
            >
              <img
                data-testid="admin-navbar_logo"
                src={logo || DEFAULT_LOGO}
                alt={`${businessName} logo`}
                className="h-7 w-auto"
              />
              <h1
                className="font-heading text-xl font-bold text-dark-900"
                data-testid="admin-navbar_title"
              >
                {title}
              </h1>
            </div>

            <div
              data-testid="admin-navbar_title-desktop"
              className="hidden md:flex items-center gap-3"
            >
              <img
                data-testid="admin-navbar_logo"
                src={logo || DEFAULT_LOGO}
                alt={`${businessName} logo`}
                className="h-8 w-auto"
              />
              <h1
                className="font-heading text-2xl font-bold text-dark-900"
                data-testid="admin-navbar_title"
              >
                {title}
              </h1>
            </div>
          </div>

          <div
            data-testid="admin-navbar_actions"
            className="flex items-center gap-4"
          >
            <button
              data-testid="admin-navbar_theme-toggle"
              onClick={toggleTheme}
              className="p-2 text-dark-600 hover:bg-gray-100 dark:hover:bg-dark-800 rounded-lg"
              aria-label={
                isDark ? "Switch to light mode" : "Switch to dark mode"
              }
              title={isDark ? "Switch to light mode" : "Switch to dark mode"}
            >
              {isDark ? (
                <Sun className="w-5 h-5" aria-hidden="true" />
              ) : (
                <Moon className="w-5 h-5" aria-hidden="true" />
              )}
            </button>

            <button
              onClick={() => setIsPanelOpen(true)}
              aria-label="Notifications"
              title="Notifications"
              data-testid="admin-navbar_notifications"
              className="relative p-2 text-dark-600 hover:bg-gray-100 dark:hover:bg-dark-800 rounded-lg"
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
              className="flex items-center gap-2 px-3 py-2 bg-gray-100 dark:bg-dark-800 rounded-lg"
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
