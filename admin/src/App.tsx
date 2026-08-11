/**
 * Root admin app component (Task 10.11).
 *
 * The route tree has three distinct tiers:
 *
 *   1. Bootstrap-gated public routes — `/login` and `/bootstrap`. Both are
 *      wrapped by `<BootstrapGuard>` (which redirects between them based
 *      on the server-reported `bootstrapAvailable` flag) so a user can
 *      never land on the wrong one.
 *
 *   2. Token-driven public routes — `/accept-invite`, `/request-reset`,
 *      `/reset`. These accept a token in the URL query string and are
 *      valid regardless of bootstrap state, so they sit OUTSIDE the
 *      bootstrap gate.
 *
 *   3. Protected app shell — everything under `/` inside `AdminLayout`.
 *      Wrapped in `<RequireCaller>` which redirects unauthenticated
 *      users to `/login`.
 *
 * The two layout guards (`BootstrapGuard`, `RequireCaller`) still accept
 * `{children}` and are re-used unchanged; the router passes `<Outlet />`
 * as the child so nested routes render in their place.
 */
import { Routes, Route, Navigate, Outlet } from "react-router-dom";
import { AdminLayout } from "./components/layout/AdminLayout";
import { RequireCaller } from "./components/auth/RequireCaller";
import { BootstrapGuard } from "./components/auth/BootstrapGuard";
import { LoginPage } from "./pages/LoginPage";
import { BootstrapOwnerPage } from "./pages/BootstrapOwnerPage";
import { AcceptInvitePage } from "./pages/AcceptInvitePage";
import { RequestResetPage } from "./pages/RequestResetPage";
import { CompleteResetPage } from "./pages/CompleteResetPage";
import { DashboardPage } from "./pages/DashboardPage";
import { ProductsPage } from "./pages/ProductsPage";
import { ProductDetailPage } from "./pages/ProductDetailPage";
import { OrdersPage } from "./pages/OrdersPage";
import { OrderDetailPage } from "./pages/OrderDetailPage";
import { SettingsPage } from "./pages/SettingsPage";

function App() {
  return (
    <Routes>
      {/* Bootstrap-gated public routes. */}
      <Route
        element={
          <BootstrapGuard>
            <Outlet />
          </BootstrapGuard>
        }
      >
        <Route path="/login" element={<LoginPage />} />
        <Route path="/bootstrap" element={<BootstrapOwnerPage />} />
      </Route>

      {/* Token-driven public routes — no bootstrap gate. */}
      <Route path="/accept-invite" element={<AcceptInvitePage />} />
      <Route path="/request-reset" element={<RequestResetPage />} />
      <Route path="/reset" element={<CompleteResetPage />} />

      {/* Protected app shell. */}
      <Route
        element={
          <RequireCaller>
            <Outlet />
          </RequireCaller>
        }
      >
        <Route path="/" element={<AdminLayout />}>
          <Route index element={<Navigate to="/dashboard" replace />} />
          <Route path="dashboard" element={<DashboardPage />} />
          <Route path="products" element={<ProductsPage />} />
          <Route path="products/new" element={<ProductsPage />} />
          <Route path="products/:id/*" element={<ProductDetailPage />} />
          <Route path="orders" element={<OrdersPage />} />
          <Route path="orders/:id/*" element={<OrderDetailPage />} />
          <Route path="settings" element={<SettingsPage />} />
        </Route>
      </Route>
    </Routes>
  );
}

export default App;
