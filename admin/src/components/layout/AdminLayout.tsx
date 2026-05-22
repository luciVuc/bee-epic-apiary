import { useState } from "react";
import { Outlet } from "react-router-dom";
import { Sidebar } from "./Sidebar";
import { AdminNavbar } from "./AdminNavbar";

export function AdminLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="min-h-screen bg-gray-50 flex" data-testid="admin-layout">
      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          data-testid="admin-layout_overlay"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar - fixed on all screen sizes */}
      <div
        className={`fixed inset-y-0 left-0 z-50 w-64 transform transition-transform duration-300 ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        } lg:translate-x-0`}
        data-testid="admin-layout_sidebar"
      >
        <Sidebar onClose={() => setSidebarOpen(false)} />
      </div>

      <div
        className="flex-1 flex flex-col min-w-0 overflow-hidden lg:ml-64"
        data-testid="admin-layout_main"
      >
        <AdminNavbar onMenuClick={() => setSidebarOpen(!sidebarOpen)} />
        <main
          className="flex-1 overflow-y-auto p-4 md:p-6"
          style={{ paddingTop: "93px" /* matches fixed AdminNavbar height */ }}
          data-testid="admin-layout_content"
        >
          <Outlet />
        </main>
      </div>
    </div>
  );
}
