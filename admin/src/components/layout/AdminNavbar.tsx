import { Bell, User, Menu } from "lucide-react";

interface AdminNavbarProps {
  onMenuClick?: () => void;
}

export function AdminNavbar({ onMenuClick }: AdminNavbarProps) {
  return (
    <header className="fixed top-0 left-0 right-0 z-30 bg-white border-b border-gray-200 px-4 md:px-6 py-4 lg:left-64">
      <div className="flex items-center justify-between">
        {/* Mobile menu button */}
        <button
          onClick={onMenuClick}
          aria-label="Toggle navigation menu"
          className="lg:hidden p-2 hover:bg-gray-100 rounded-lg"
        >
          <Menu className="w-5 h-5" />
        </button>

        <div className="lg:hidden">
          <h1 className="font-heading text-xl font-bold text-dark-900">
            Bee Epic Apiary Admin
          </h1>
        </div>

        <div className="hidden lg:block">
          <h1 className="font-heading text-2xl font-bold text-dark-900">
            Bee Epic Apiary Admin
          </h1>
        </div>

        <div className="flex items-center gap-4">
          <button
            aria-label="Notifications"
            className="relative p-2 text-dark-600 hover:bg-gray-100 rounded-lg"
          >
            <Bell className="w-5 h-5" />
            <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full"></span>
          </button>
          <div className="flex items-center gap-2 px-3 py-2 bg-gray-100 rounded-lg">
            <User className="w-5 h-5 text-dark-600" />
            <span className="text-sm font-medium text-dark-700">Admin</span>
          </div>
        </div>
      </div>
    </header>
  );
}
