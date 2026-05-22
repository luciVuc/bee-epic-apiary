/** Fixed top navigation bar with mobile hamburger menu, title, notifications, and user indicator */
import { Bell, User, Menu } from "lucide-react";

export interface IAdminNavbarProps {
  /** Callback when the mobile hamburger menu button is clicked */
  onMenuClick?: () => void;
}

export function AdminNavbar({ onMenuClick }: IAdminNavbarProps) {
  return (
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
            Bee Epic Apiary Admin
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
            Bee Epic Apiary Admin
          </h1>
        </div>

        <div
          data-testid="admin-navbar_actions"
          className="flex items-center gap-4"
        >
          <button
            aria-label="Notifications"
            title="Notifications"
            data-testid="admin-navbar_notifications"
            className="relative p-2 text-dark-600 hover:bg-gray-100 rounded-lg"
          >
            <Bell className="w-5 h-5" />
            <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full"></span>
          </button>
          <div
            className="flex items-center gap-2 px-3 py-2 bg-gray-100 rounded-lg"
            data-testid="admin-navbar_user"
          >
            <User className="w-5 h-5 text-dark-600" />
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
  );
}
