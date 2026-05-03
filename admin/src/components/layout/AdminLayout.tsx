import { Outlet } from "react-router-dom";
import { Sidebar } from "./Sidebar";
import { AdminNavbar } from "./AdminNavbar";

export function AdminLayout() {
  return (
    <div className="min-h-screen bg-gray-50 flex">
      <Sidebar />
      <div className="flex-1 flex flex-col">
        <AdminNavbar />
        <main className="flex-1 p-6 overflow-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
