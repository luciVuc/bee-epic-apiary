import { NavLink } from "react-router-dom";
import { LayoutDashboard, Package, Settings, Hexagon, X } from "lucide-react";

export interface ISidebarProps {
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
      to: "/settings",
      icon: Settings,
      label: "Settings",
    },
  ];

  return (
    <aside className="w-64 bg-white border-r border-gray-200 flex flex-col h-full">
      <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
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
        {/* Mobile close button */}
        <button
          onClick={onClose}
          aria-label="Close sidebar"
          className="lg:hidden p-1 hover:bg-gray-100 rounded"
        >
          <X className="w-5 h-5" />
        </button>
      </div>
      <nav className="flex-1 p-4 space-y-2 overflow-y-auto">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            onClick={onClose}
            className={({ isActive }) =>
              `flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
                isActive
                  ? "bg-primary-50 text-primary-700 font-medium"
                  : "text-dark-600 hover:bg-gray-100"
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
