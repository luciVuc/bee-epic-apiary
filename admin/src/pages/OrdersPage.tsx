/** Orders list page with search, status/ payment status filtering, desktop table / mobile card view, and pagination */
import { useEffect, useLayoutEffect, useRef, useCallback } from "react";
import { useDispatch, useSelector } from "react-redux";
import { Link, useLocation, useSearchParams } from "react-router-dom";
import { Search, Filter, ShoppingCart, AlertCircle, X } from "lucide-react";
import type { RootState, AppDispatch } from "../store";
import { fetchOrders } from "../store/ordersSlice";
import { Spinner } from "../components/shared/Spinner";
import {
  orderStatusBadge,
  orderStatusLabel,
  orderPaymentStatusBadge,
  orderPaymentStatusLabel,
  orderMetadataStatusBadge,
  orderMetadataStatusLabel,
  formatPrice,
  formatDate,
} from "../utils/badgeClasses";

const STATUS_OPTIONS = [
  { value: "ALL", label: "All Statuses" },
  { value: "open", label: "Open" },
  { value: "complete", label: "Completed" },
  { value: "expired", label: "Expired" },
];

const PAYMENT_STATUS_OPTIONS = [
  { value: "ALL", label: "All Payments" },
  { value: "paid", label: "Paid" },
  { value: "unpaid", label: "Unpaid" },
  { value: "no_payment_required", label: "No Payment Required" },
];

const ORDER_STATUS_OPTIONS = [
  { value: "ALL", label: "All Orders" },
  { value: "new", label: "New" },
  { value: "pending", label: "Pending" },
  { value: "fulfilled", label: "Fulfilled" },
];

export function OrdersPage() {
  const dispatch = useDispatch<AppDispatch>();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const {
    items: orders,
    loading,
    error,
    hasMore,
    totalCount,
  } = useSelector((state: RootState) => state.orders);
  const searchTimer = useRef<ReturnType<typeof setTimeout>>(null);
  const prevParamsKey = useRef(
    `${searchParams.get("search") || ""}|${searchParams.get("status") || "ALL"}|${searchParams.get("payment_status") || "ALL"}|${searchParams.get("order_status") || "ALL"}`,
  );

  const searchTerm = searchParams.get("search") || "";
  const selectedStatus = searchParams.get("status") || "ALL";
  const selectedPaymentStatus = searchParams.get("payment_status") || "ALL";
  const selectedOrderStatus = searchParams.get("order_status") || "ALL";

  const updateSearchParams = useCallback(
    (
      search: string,
      status: string,
      paymentStatus: string,
      orderStatus: string,
    ) => {
      const params: Record<string, string> = {};
      if (search) params.search = search;
      if (status && status !== "ALL") params.status = status;
      if (paymentStatus && paymentStatus !== "ALL")
        params.payment_status = paymentStatus;
      if (orderStatus && orderStatus !== "ALL")
        params.order_status = orderStatus;
      setSearchParams(params, { replace: true });
    },
    [setSearchParams],
  );

  const buildFetchParams = (includeLimit?: boolean) => {
    const params: {
      search?: string;
      status?: string;
      payment_status?: string;
      order_status?: string;
      limit?: number;
    } = {};
    if (searchTerm) params.search = searchTerm;
    if (selectedStatus !== "ALL") params.status = selectedStatus;
    if (selectedPaymentStatus !== "ALL")
      params.payment_status = selectedPaymentStatus;
    if (selectedOrderStatus !== "ALL")
      params.order_status = selectedOrderStatus;
    if (includeLimit) {
      const limitParam = searchParams.get("limit");
      if (limitParam) {
        const parsed = parseInt(limitParam, 10);
        if (!isNaN(parsed) && parsed > 0) params.limit = parsed;
      }
    }
    return params;
  };

  useLayoutEffect(() => {
    const saved = sessionStorage.getItem("adminOrdersScrollY");
    if (!saved) return;
    const y = parseInt(saved, 10);
    window.scrollTo(0, y);
    const id = requestAnimationFrame(() => {
      window.scrollTo(0, y);
      sessionStorage.removeItem("adminOrdersScrollY");
    });
    return () => cancelAnimationFrame(id);
  }, []);

  useEffect(() => {
    const currentKey = `${searchTerm}|${selectedStatus}|${selectedPaymentStatus}|${selectedOrderStatus}`;

    if (prevParamsKey.current === currentKey) {
      prevParamsKey.current = currentKey;
      dispatch(fetchOrders(buildFetchParams(true)));
      return;
    }

    prevParamsKey.current = currentKey;

    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(async () => {
      await dispatch(fetchOrders(buildFetchParams()));
    }, 300);
    return () => {
      if (searchTimer.current) clearTimeout(searchTimer.current);
    };
  }, [
    searchTerm,
    selectedStatus,
    selectedPaymentStatus,
    selectedOrderStatus,
    dispatch,
  ]);

  const saveScroll = useCallback(() => {
    sessionStorage.setItem("adminOrdersScrollY", String(window.scrollY));
  }, []);

  const handleLoadMore = () => {
    if (orders.length === 0) return;
    const lastOrder = orders[orders.length - 1];
    if (!lastOrder?.id) return;
    const newLimit = orders.length + 10;
    const params: Record<string, string> = {};
    if (searchTerm) params.search = searchTerm;
    if (selectedStatus && selectedStatus !== "ALL")
      params.status = selectedStatus;
    if (selectedPaymentStatus && selectedPaymentStatus !== "ALL")
      params.payment_status = selectedPaymentStatus;
    if (selectedOrderStatus && selectedOrderStatus !== "ALL")
      params.order_status = selectedOrderStatus;
    params.limit = String(newLimit);
    setSearchParams(params, { replace: true });
    saveScroll();
    dispatch(
      fetchOrders({
        starting_after: lastOrder.id,
        limit: 10,
        search: searchTerm,
        status: selectedStatus,
        payment_status: selectedPaymentStatus,
        order_status: selectedOrderStatus,
      }),
    );
  };

  const currentUrl = `${location.pathname}${location.search}`;

  const handleSearchChange = (value: string) => {
    updateSearchParams(
      value,
      selectedStatus,
      selectedPaymentStatus,
      selectedOrderStatus,
    );
  };

  const handleStatusChange = (value: string) => {
    updateSearchParams(
      searchTerm,
      value,
      selectedPaymentStatus,
      selectedOrderStatus,
    );
  };

  const handlePaymentStatusChange = (value: string) => {
    updateSearchParams(searchTerm, selectedStatus, value, selectedOrderStatus);
  };

  const handleOrderStatusChange = (value: string) => {
    updateSearchParams(
      searchTerm,
      selectedStatus,
      selectedPaymentStatus,
      value,
    );
  };

  if (loading && orders.length === 0) {
    return <Spinner />;
  }

  const showingCount = orders.length;

  return (
    <div data-testid="orders-page">
      <div
        data-testid="orders-page_header"
        className="sticky top-0 z-20 bg-white border-b border-gray-200 px-4 py-4 mb-6 flex items-center justify-between"
      >
        <h2
          className="font-heading text-3xl font-bold text-dark-900"
          data-testid="orders-page_title"
        >
          Orders Management
        </h2>
      </div>

      {error && (
        <div
          role="alert"
          className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2"
          data-testid="orders-page_error"
        >
          <AlertCircle className="w-5 h-5 text-red-500" />
          <span className="text-red-700">{error}</span>
        </div>
      )}

      <div
        data-testid="orders-page_filter"
        className="bg-white p-4 rounded-xl shadow-sm border border-gray-200 mb-6"
      >
        <div
          data-testid="orders-page_filter-content"
          className="flex flex-col md:flex-row gap-4"
        >
          <div data-testid="orders-page_search" className="flex-1 relative">
            <Search
              data-testid="orders-page_search-icon"
              className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-dark-400"
            />
            <label htmlFor="orders-search" className="sr-only">
              Search orders
            </label>
            <input
              id="orders-search"
              type="text"
              placeholder="Search by customer email, name, or order ID..."
              value={searchTerm}
              onChange={(e) => handleSearchChange(e.target.value)}
              data-testid="orders-page_search-input"
              className="w-full pl-10 pr-10 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
            />
            {searchTerm && (
              <button
                onClick={() => handleSearchChange("")}
                aria-label="Clear search"
                data-testid="orders-page_search-clear"
                className="absolute right-3 top-1/2 -translate-y-1/2 text-dark-400 hover:text-dark-600 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* Filters Panel */}
          <div
            data-testid="orders-page_filters-panel"
            className="flex items-center gap-4 flex-wrap"
          >
            <div
              data-testid="orders-page_status-filter-container"
              className="flex items-center gap-2"
            >
              <Filter
                data-testid="orders-page_status-filter-icon"
                className="w-4 h-4 text-dark-400"
              />
              <select
                value={selectedStatus}
                onChange={(e) => handleStatusChange(e.target.value)}
                aria-label="Filter by status"
                data-testid="orders-page_status-filter"
                className="px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
              >
                {STATUS_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            <div
              data-testid="orders-page_payment-status-filter-container"
              className="flex items-center gap-2"
            >
              <Filter
                data-testid="orders-page_payment-status-filter-icon"
                className="w-4 h-4 text-dark-400"
              />
              <select
                value={selectedPaymentStatus}
                onChange={(e) => handlePaymentStatusChange(e.target.value)}
                aria-label="Filter by payment status"
                data-testid="orders-page_payment-status-filter"
                className="px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
              >
                {PAYMENT_STATUS_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            <div
              data-testid="orders-page_order-status-filter-container"
              className="flex items-center gap-2"
            >
              <Filter
                data-testid="orders-page_order-status-filter-icon"
                className="w-4 h-4 text-dark-400"
              />
              <select
                value={selectedOrderStatus}
                onChange={(e) => handleOrderStatusChange(e.target.value)}
                aria-label="Filter by order status"
                data-testid="orders-page_order-status-filter"
                className="px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
              >
                {ORDER_STATUS_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        <div
          data-testid="orders-page_order-count"
          className="mt-3 text-sm text-dark-500"
        >
          Showing {showingCount} of {totalCount} orders
        </div>
      </div>

      {orders.length === 0 && !loading ? (
        <div data-testid="orders-page_empty" className="text-center py-12">
          <ShoppingCart
            data-testid="orders-page_empty-icon"
            className="w-16 h-16 text-dark-300 mx-auto mb-4"
          />
          <h3
            data-testid="orders-page_empty-title"
            className="font-heading text-xl font-semibold text-dark-700 mb-2"
          >
            No orders found
          </h3>
          <p
            data-testid="orders-page_empty-description"
            className="text-dark-500 mb-4"
          >
            {searchTerm ||
            selectedStatus !== "ALL" ||
            selectedPaymentStatus !== "ALL" ||
            selectedOrderStatus !== "ALL"
              ? "Try adjusting your search or filters"
              : "No orders have been placed yet"}
          </p>
        </div>
      ) : (
        <div data-testid="orders-page_content" className="relative">
          {loading && (
            <div
              data-testid="orders-page_loading-overlay"
              role="status"
              aria-live="polite"
              className="absolute inset-0 bg-white/60 flex items-center justify-center z-10 min-h-[200px]"
            >
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-500"></div>
              <span className="sr-only">Loading orders...</span>
            </div>
          )}

          <div
            data-testid="orders-page_table-container"
            className="hidden md:flex flex-col overflow-x-auto"
          >
            <table data-testid="orders-page_table" className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200 sticky top-0 z-10">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-dark-500 uppercase tracking-wider">
                    Order
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-dark-500 uppercase tracking-wider">
                    Customer
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-dark-500 uppercase tracking-wider">
                    Total
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-dark-500 uppercase tracking-wider">
                    Payment Status
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-dark-500 uppercase tracking-wider">
                    Order Status
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-dark-500 uppercase tracking-wider">
                    Payment
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-dark-500 uppercase tracking-wider">
                    Date
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-dark-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {orders.map((order) => (
                  <tr
                    key={order.id}
                    className="hover:bg-gray-50 transition-colors"
                  >
                    <td className="px-6 py-4 whitespace-nowrap">
                      <Link
                        to={`/orders/${order.id}`}
                        onClick={saveScroll}
                        state={{ from: currentUrl }}
                        className="font-mono text-sm text-primary-600 hover:text-primary-700"
                      >
                        {order.id.slice(0, 14)}...
                      </Link>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-dark-900 font-medium">
                        {order.customerName || "—"}
                      </div>
                      <div className="text-sm text-dark-500">
                        {order.customerEmail || "—"}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="text-dark-700 font-medium">
                        {formatPrice(order.amountTotal)}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span
                        className={`px-2 py-1 text-xs font-medium rounded-full ${orderStatusBadge(order.status)}`}
                      >
                        {orderStatusLabel(order.status)}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span
                        className={`px-2 py-1 text-xs font-medium rounded-full ${orderMetadataStatusBadge(order.orderStatus)}`}
                      >
                        {orderMetadataStatusLabel(order.orderStatus)}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span
                        className={`px-2 py-1 text-xs font-medium rounded-full ${orderPaymentStatusBadge(order.paymentStatus)}`}
                      >
                        {orderPaymentStatusLabel(order.paymentStatus)}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-dark-500">
                      {formatDate(order.created)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right">
                      <Link
                        to={`/orders/${order.id}`}
                        onClick={saveScroll}
                        state={{ from: currentUrl }}
                        className="px-3 py-1.5 text-sm bg-primary-500 text-white rounded-lg hover:bg-primary-600 transition-colors"
                      >
                        View
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div
            data-testid="orders-page_mobile-container"
            className="md:hidden space-y-4"
          >
            {orders.map((order) => (
              <div
                key={order.id}
                className="bg-white p-4 rounded-xl shadow-sm border border-gray-200"
              >
                <div className="flex items-center justify-between mb-3">
                  <div className="font-mono text-sm text-primary-600">
                    {order.id.slice(0, 14)}...
                  </div>
                  <span
                    className={`px-2 py-1 text-xs font-medium rounded-full ${orderStatusBadge(order.status)}`}
                  >
                    {orderStatusLabel(order.status)}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div>
                    <span className="text-dark-500">Customer:</span>
                    <span className="ml-1 text-dark-700">
                      {order.customerName || "—"}
                    </span>
                  </div>
                  <div>
                    <span className="text-dark-500">Email:</span>
                    <span className="ml-1 text-dark-700">
                      {order.customerEmail || "—"}
                    </span>
                  </div>
                  <div>
                    <span className="text-dark-500">Total:</span>
                    <span className="ml-1 text-dark-700 font-medium">
                      {formatPrice(order.amountTotal)}
                    </span>
                  </div>
                  <div>
                    <span className="text-dark-500">Payment:</span>
                    <span
                      className={`ml-1 px-2 py-0.5 text-xs font-medium rounded-full ${orderPaymentStatusBadge(order.paymentStatus)}`}
                    >
                      {orderPaymentStatusLabel(order.paymentStatus)}
                    </span>
                  </div>
                  <div>
                    <span className="text-dark-500">Order:</span>
                    <span
                      className={`ml-1 px-2 py-0.5 text-xs font-medium rounded-full ${orderMetadataStatusBadge(order.orderStatus)}`}
                    >
                      {orderMetadataStatusLabel(order.orderStatus)}
                    </span>
                  </div>
                  <div className="col-span-2">
                    <span className="text-dark-500">Date:</span>
                    <span className="ml-1 text-dark-700">
                      {formatDate(order.created)}
                    </span>
                  </div>
                </div>
                <div className="flex gap-2 mt-3 pt-3 border-t border-gray-200">
                  <Link
                    to={`/orders/${order.id}`}
                    onClick={saveScroll}
                    state={{ from: currentUrl }}
                    className="flex-1 text-center px-3 py-2 text-sm bg-primary-500 text-white rounded-lg hover:bg-primary-600 transition-colors"
                  >
                    View Details
                  </Link>
                </div>
              </div>
            ))}
          </div>

          {hasMore && (
            <div className="mt-6 text-center">
              <button
                onClick={handleLoadMore}
                disabled={loading}
                data-testid="orders-page_load-more-btn"
                className="px-6 py-2 bg-primary-500 text-white rounded-lg hover:bg-primary-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? "Loading..." : "Load More Orders"}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
