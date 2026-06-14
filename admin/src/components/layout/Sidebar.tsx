/** Persistent sidebar navigation with Dashboard, Products, and Settings links. Active route is highlighted. */
import { NavLink } from "react-router-dom";
import {
  LayoutDashboard,
  Package,
  ShoppingCart,
  Settings,
  Hexagon,
  X,
} from "lucide-react";

export interface ISidebarProps {
  /** Callback to close the sidebar (used on mobile after link click) */
  onClose?: () => void;
}

export function Sidebar({ onClose }: ISidebarProps) {
  const navItems = [
    {
      to: "/dashboard",
      icon: LayoutDashboard,
      label: "Dashboard",
    },
    {
      to: "/products",
      icon: Package,
      label: "Products",
    },
    {
      to: "/orders",
      icon: ShoppingCart,
      label: "Orders",
    },
    {
      to: "/settings",
      icon: Settings,
      label: "Settings",
    },
  ];

  return (
    <aside
      className="w-64 bg-white dark:bg-dark-950 border-r border-gray-200 dark:border-dark-700 flex flex-col h-full"
      data-testid="sidebar"
    >
      <div
        className="px-6 py-4 border-b border-gray-200 dark:border-dark-700 flex items-center justify-between"
        data-testid="sidebar_header"
      >
        <NavLink
          to="/dashboard"
          className="flex items-center gap-2"
          onClick={onClose}
          style={{ margin: "0.125rem 0" }}
        >
          <Hexagon className="w-8 h-8 text-primary-500" />
          <span className="font-heading text-xl font-bold text-dark-900">
            Admin Panel
          </span>
        </NavLink>
        <button
          onClick={onClose}
          aria-label="Close sidebar"
          title="Close sidebar"
          className="lg:hidden p-1 hover:bg-gray-100 dark:hover:bg-dark-800 rounded"
          data-testid="sidebar_close-btn"
        >
          <X className="w-5 h-5" />
        </button>
      </div>
      <nav
        aria-label="Main navigation"
        className="flex-1 p-4 space-y-2 overflow-y-auto"
        data-testid="sidebar_nav"
      >
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            onClick={onClose}
            data-testid={`sidebar_link-${item.label.toLowerCase().replace(/\s+/g, "-")}`}
            className={({ isActive }) =>
              `flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
                isActive
                  ? "bg-primary-50 dark:bg-primary-900/30 text-primary-700 dark:text-primary-400 font-medium"
                  : "text-dark-600 hover:bg-gray-100 dark:hover:bg-dark-800"
              }`
            }
          >
            <item.icon className="w-5 h-5" />
            {item.label}
          </NavLink>
        ))}
      </nav>
    </aside>
  );
}
