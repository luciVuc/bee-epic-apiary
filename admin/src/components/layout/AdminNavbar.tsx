/** Fixed top navigation bar with mobile hamburger menu, dynamic title from settings, notifications panel, and user indicator */
import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Bell, Menu, Sun, Moon } from "lucide-react";
import { ENotificationType } from "@bee-epic/shared";
import { useTheme } from "../../hooks/useTheme";
import { useCaller } from "../../hooks/useCaller";
import * as api from "../../utils/api";
import { UserMenu } from "../auth/UserMenu";
import type { ISiteContent } from "../../types/settings";
import type { IOrder } from "../../types/order";
import {
  ORDER_STATUS_CHANGED_EVENT,
  NEW_ORDER_EVENT,
  PRODUCT_UPDATED_EVENT,
  PRODUCT_DELETED_EVENT,
  DEFAULT_LOGO,
} from "../../utils/constants";
import { DEFAULT_API_URL } from "../../utils/constants";
import { NotificationsPanel } from "../notifications/NotificationsPanel";

export interface IAdminNavbarProps {
  /** Callback when the mobile hamburger menu button is clicked */
  onMenuClick?: () => void;
}

/**
 * Fixed top bar: mobile hamburger, settings-driven business name/logo, theme
 * toggle, and the notifications bell backed by a Server-Sent-Events stream.
 *
 * The SSE stream is gated on an authenticated `caller` because EventSource
 * cannot send the dev-email header and a 401 handshake is fatal (the browser
 * never auto-reconnects a stream that failed to open). A bounded-backoff
 * self-heal and a small health badge cover the "stream silently died" failure
 * mode that otherwise looks like notifications just stopped arriving.
 */
export function AdminNavbar({ onMenuClick }: IAdminNavbarProps) {
  const navigate = useNavigate();
  const { isDark, toggleTheme } = useTheme();
  const { caller } = useCaller();
  const [businessName, setBusinessName] = useState<string>("");
  const [logo, setLogo] = useState<string>("");
  const [isPanelOpen, setIsPanelOpen] = useState(false);
  const [notifications, setNotifications] = useState<IOrder[]>([]);
  // SSE connection health for the small badge near the bell icon
  // (review I9). Without an indicator, a broken stream looks like
  // "notifications just stopped arriving" — confusing to admins, and the
  // root cause (auth cookie not forwarded — post-Phase-9 that's `bea_at`)
  // was opaque.
  const [sseHealth, setSseHealth] = useState<
    "connected" | "reconnecting" | "down"
  >("connected");

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
    // Gate on authentication. EventSource cannot send the `X-Dev-Email` header
    // and, post-Phase-10, dev auth is a real cookie login — so the stream only
    // authenticates once a caller exists (the `bea_at` cookie rides the
    // handshake via withCredentials). Opening it earlier gets a 401, which is
    // FATAL for EventSource: a non-2xx handshake fires `error` and the browser
    // never auto-reconnects (auto-reconnect only covers an established stream
    // dropping mid-flight). Before this gate, the stream opened on mount, 401'd
    // before login, and stayed dead forever — orders flipped to "new" on the
    // server but the bell never updated. Keying the effect on `caller` (re)opens
    // the stream when the user becomes authenticated.
    if (!caller) return;

    const apiBaseUrl = DEFAULT_API_URL;
    let eventSource: EventSource | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
    let consecutiveErrors = 0;
    let closed = false; // set on cleanup so a pending reconnect can't fire

    const connect = () => {
      if (closed) return;
      // withCredentials: true → the `bea_at` HttpOnly access-token cookie
      // (Phase 9 trust chain) rides the SSE handshake. Without it,
      // `resolveCaller` on the worker can't verify the caller and silently
      // 401s every EventSource connection (review I9).
      const es = new EventSource(`${apiBaseUrl}/notifications/stream`, {
        withCredentials: true,
      });
      eventSource = es;

      es.addEventListener("connected", () => {
        consecutiveErrors = 0;
        setSseHealth("connected");
        fetchNotifications();
      });

      es.addEventListener(ENotificationType.NEW_ORDER, () => {
        fetchNotifications();
        window.dispatchEvent(new CustomEvent(NEW_ORDER_EVENT));
      });

      // Another admin (or the same admin in another tab) changed an order's
      // internal status. Refresh the notification list — the order may have
      // moved out of `new` and should disappear from the panel.
      es.addEventListener(ENotificationType.ORDER_STATUS_CHANGED, (evt) => {
        fetchNotifications();
        let detail: unknown = null;
        try {
          if ("data" in evt && typeof (evt as MessageEvent).data === "string") {
            detail = JSON.parse((evt as MessageEvent).data);
          }
        } catch {
          // ignore malformed payload
        }
        window.dispatchEvent(
          new CustomEvent(ORDER_STATUS_CHANGED_EVENT, { detail }),
        );
      });

      es.addEventListener(ENotificationType.PRODUCT_UPDATED, (evt) => {
        let detail: unknown = null;
        try {
          if ("data" in evt && typeof (evt as MessageEvent).data === "string") {
            detail = JSON.parse((evt as MessageEvent).data);
          }
        } catch {
          // ignore malformed payload
        }
        window.dispatchEvent(
          new CustomEvent(PRODUCT_UPDATED_EVENT, { detail }),
        );
      });

      es.addEventListener(ENotificationType.PRODUCT_DELETED, (evt) => {
        let detail: unknown = null;
        try {
          if ("data" in evt && typeof (evt as MessageEvent).data === "string") {
            detail = JSON.parse((evt as MessageEvent).data);
          }
        } catch {
          // ignore malformed payload
        }
        window.dispatchEvent(
          new CustomEvent(PRODUCT_DELETED_EVENT, { detail }),
        );
      });

      // Health + self-heal. On a transient blip the browser auto-reconnects
      // and readyState stays CONNECTING — we only update the badge. But a
      // FATAL error (bad handshake / 401) closes the stream (readyState
      // CLOSED) and the browser will NOT retry on its own, so we schedule our
      // own bounded-backoff reconnect. Backoff caps at 30s; the counter (and
      // health) reset on the next `connected`.
      es.addEventListener("error", () => {
        consecutiveErrors++;
        setSseHealth(consecutiveErrors > 3 ? "down" : "reconnecting");
        if (es.readyState === es.CLOSED && !closed) {
          es.close();
          const delay = Math.min(1_000 * 2 ** (consecutiveErrors - 1), 30_000);
          clearTimeout(reconnectTimer);
          reconnectTimer = setTimeout(connect, delay);
        }
      });
    };

    connect();

    return () => {
      closed = true;
      clearTimeout(reconnectTimer);
      eventSource?.close();
    };
  }, [fetchNotifications, caller]);

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
              className="lg:hidden p-2 hover:bg-gray-100 dark:hover:bg-dark-200 rounded-lg"
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
                data-testid="admin-navbar_logo-mobile"
                src={logo || DEFAULT_LOGO}
                alt={`${businessName} logo`}
                className="h-7 w-auto"
              />
              <h1
                className="font-heading text-xl font-bold text-dark-900 hidden sm:block"
                data-testid="admin-navbar_title-mobile-text"
              >
                {title}
              </h1>
            </div>

            <div
              data-testid="admin-navbar_title-desktop"
              className="hidden md:flex items-center gap-3"
            >
              <img
                data-testid="admin-navbar_logo-desktop"
                src={logo || DEFAULT_LOGO}
                alt={`${businessName} logo`}
                className="h-8 w-auto"
              />
              <h1
                className="font-heading text-2xl font-bold text-dark-900"
                data-testid="admin-navbar_title-desktop-text"
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
              className="p-2 text-dark-600 hover:bg-gray-100 dark:hover:bg-dark-200 rounded-lg"
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
              className="relative p-2 text-dark-600 hover:bg-gray-100 dark:hover:bg-dark-200 rounded-lg"
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
              {/* SSE health badge (review I9). Hidden when connected so the
                  bell doesn't look broken in the happy path; visible only when
                  reconnecting or down. */}
              <span
                data-testid="admin-navbar_sse-health"
                data-sse-health={sseHealth}
                role={sseHealth === "connected" ? undefined : "status"}
                aria-label={
                  sseHealth === "connected"
                    ? "Notifications stream connected"
                    : sseHealth === "reconnecting"
                      ? "Notifications stream reconnecting"
                      : "Notifications stream unavailable"
                }
                className={`absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full ${
                  sseHealth === "connected"
                    ? "hidden"
                    : sseHealth === "reconnecting"
                      ? "bg-amber-400 animate-pulse"
                      : "bg-red-600"
                }`}
              ></span>
            </button>
            <div data-testid="admin-navbar_user">
              <UserMenu />
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
