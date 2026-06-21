/** Orders list page with search, status/ payment status filtering, desktop table / mobile card view, and pagination */
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useCallback,
  useState,
} from "react";
import { useDispatch, useSelector } from "react-redux";
import { Link, useLocation, useSearchParams } from "react-router-dom";
import {
  Search,
  Filter,
  ShoppingCart,
  AlertCircle,
  X,
  ChevronDown,
} from "lucide-react";
import type { RootState, AppDispatch } from "../store";
import { fetchOrders } from "../store/ordersSlice";
import { Spinner } from "../components/shared/Spinner";
import { NEW_ORDER_EVENT } from "../utils/constants";
import {
  orderStatusBadge,
  orderStatusLabel,
  orderPaymentStatusBadge,
  orderPaymentStatusLabel,
  orderMetadataStatusBadge,
  orderMetadataStatusLabel,
  formatPrice,
  formatDate,
  truncateOrderId,
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
  const [showFilters, setShowFilters] = useState(
    () =>
      (searchParams.get("status") || "ALL") !== "ALL" ||
      (searchParams.get("payment_status") || "ALL") !== "ALL" ||
      (searchParams.get("order_status") || "ALL") !== "ALL",
  );
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

  useEffect(() => {
    const handleNewOrder = () => {
      dispatch(fetchOrders(buildFetchParams(true)));
    };
    window.addEventListener(NEW_ORDER_EVENT, handleNewOrder);
    return () => window.removeEventListener(NEW_ORDER_EVENT, handleNewOrder);
  }, [
    dispatch,
    searchTerm,
    selectedStatus,
    selectedPaymentStatus,
    selectedOrderStatus,
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
        className="sticky top-0 z-20 bg-white border-b border-gray-200 px-4 py-4 mb-6 flex items-center justify-between dark:bg-dark-950 dark:border-gray-700"
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
          className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2 dark:bg-red-900/20 dark:border-red-800/30"
          data-testid="orders-page_error"
        >
          <AlertCircle className="w-5 h-5 text-red-500" />
          <span className="text-red-700 dark:text-red-300">{error}</span>
        </div>
      )}

      <div
        data-testid="orders-page_filter"
        className="bg-white p-4 rounded-xl shadow-sm border border-gray-200 mb-6 dark:bg-dark-950 dark:border-gray-700"
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
              className="w-full pl-10 pr-10 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 dark:border-gray-600 dark:bg-dark-100 dark:text-dark-900 dark:focus:ring-primary-400 dark:focus:border-primary-400"
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

          {/* Filter Toggle */}
          <button
            onClick={() => setShowFilters(!showFilters)}
            data-testid="orders-page_filter-toggle"
            aria-label="Toggle filters"
            className="inline-flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors shrink-0 dark:border-gray-600 dark:hover:bg-dark-200"
          >
            <Filter className="w-4 h-4 text-dark-600" />
            <span className="text-sm font-medium text-dark-700">Filters</span>
            <ChevronDown
              className={`w-4 h-4 text-dark-400 transition-transform duration-200 ${showFilters ? "rotate-180" : ""}`}
            />
          </button>
        </div>

        {/* Collapsible Filters Panel */}
        <div
          data-testid="orders-page_filters-panel"
          className={`overflow-hidden transition-all duration-200 ease-in-out ${showFilters ? "max-h-96 opacity-100 mt-4" : "max-h-0 opacity-0"}`}
        >
          <div className="pt-4 border-t border-gray-200 dark:border-gray-700">
            <div className="flex flex-col sm:flex-row gap-4">
              {/* Status Filter */}
              <div
                data-testid="orders-page_checkout-status-filter-container"
                className="flex flex-col gap-1.5"
              >
                <label
                  htmlFor="orders-status-filter"
                  className="text-sm font-medium text-dark-700"
                >
                  Checkout Status
                </label>
                <select
                  id="orders-status-filter"
                  value={selectedStatus}
                  onChange={(e) => handleStatusChange(e.target.value)}
                  aria-label="Filter by status"
                  data-testid="orders-page_checkout-status-filter"
                  className="px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 dark:border-gray-600 dark:bg-dark-100 dark:hover:bg-dark-200 dark:text-dark-900 dark:focus:ring-primary-400 dark:focus:border-primary-400"
                >
                  {STATUS_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Payment Status Filter */}
              <div
                data-testid="orders-page_payment-status-filter-container"
                className="flex flex-col gap-1.5"
              >
                <label
                  htmlFor="orders-payment-status-filter"
                  className="text-sm font-medium text-dark-700"
                >
                  Payment Status
                </label>
                <select
                  id="orders-payment-status-filter"
                  value={selectedPaymentStatus}
                  onChange={(e) => handlePaymentStatusChange(e.target.value)}
                  aria-label="Filter by payment status"
                  data-testid="orders-page_payment-status-filter"
                  className="px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 dark:border-gray-600 dark:bg-dark-100 dark:hover:bg-dark-200 dark:text-dark-900 dark:focus:ring-primary-400 dark:focus:border-primary-400"
                >
                  {PAYMENT_STATUS_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Order Status Filter */}
              <div
                data-testid="orders-page_order-status-filter-container"
                className="flex flex-col gap-1.5"
              >
                <label
                  htmlFor="orders-order-status-filter"
                  className="text-sm font-medium text-dark-700"
                >
                  Order Status
                </label>
                <select
                  id="orders-order-status-filter"
                  value={selectedOrderStatus}
                  onChange={(e) => handleOrderStatusChange(e.target.value)}
                  aria-label="Filter by order status"
                  data-testid="orders-page_order-status-filter"
                  className="px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 dark:border-gray-600 dark:bg-dark-100 dark:hover:bg-dark-200 dark:text-dark-900 dark:focus:ring-primary-400 dark:focus:border-primary-400"
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
              className="absolute inset-0 bg-white/60 flex items-center justify-center z-10 min-h-[200px] dark:bg-dark-950/60"
            >
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-500 dark:border-primary-400"></div>
              <span className="sr-only">Loading orders...</span>
            </div>
          )}

          <div
            data-testid="orders-page_table-container"
            className="hidden md:flex flex-col overflow-x-auto"
          >
            <table data-testid="orders-page_table" className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200 sticky top-0 z-10 dark:bg-dark-100 dark:border-gray-700">
                <tr
                  data-testid="orders-page_table-header"
                  className="text-left text-xs font-medium text-dark-500 uppercase tracking-wider"
                >
                  <th
                    data-testid="orders-page_table-header-icon"
                    className="px-2 py-3 text-left text-xs font-medium text-dark-500 uppercase tracking-wider w-10"
                  >
                    <span className="sr-only">Status icon</span>
                  </th>
                  <th
                    data-testid="orders-page_table-header-order"
                    className="px-6 py-3 text-left text-xs font-medium text-dark-500 uppercase tracking-wider"
                  >
                    Order
                  </th>
                  <th
                    data-testid="orders-page_table-header-order-status"
                    className="px-6 py-3 text-left text-xs font-medium text-dark-500 uppercase tracking-wider"
                  >
                    Order Status
                  </th>
                  <th
                    data-testid="orders-page_table-header-customer"
                    className="px-6 py-3 text-left text-xs font-medium text-dark-500 uppercase tracking-wider"
                  >
                    Customer
                  </th>
                  <th
                    data-testid="orders-page_table-header-total"
                    className="px-6 py-3 text-left text-xs font-medium text-dark-500 uppercase tracking-wider"
                  >
                    Total
                  </th>
                  <th
                    data-testid="orders-page_table-header-checkout-status"
                    className="px-6 py-3 text-left text-xs font-medium text-dark-500 uppercase tracking-wider"
                  >
                    Checkout Status
                  </th>
                  <th
                    data-testid="orders-page_table-header-payment-status"
                    className="px-6 py-3 text-left text-xs font-medium text-dark-500 uppercase tracking-wider"
                  >
                    Payment Status
                  </th>
                  <th
                    data-testid="orders-page_table-header-date"
                    className="px-6 py-3 text-left text-xs font-medium text-dark-500 uppercase tracking-wider"
                  >
                    Date
                  </th>
                  <th
                    data-testid="orders-page_table-header-actions"
                    className="px-6 py-3 text-right text-xs font-medium text-dark-500 uppercase tracking-wider"
                  >
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                {orders.map((order) => (
                  <tr
                    key={order.id}
                    className="hover:bg-gray-50 transition-colors dark:hover:bg-dark-100"
                    data-testid="orders-page_table-row"
                  >
                    <td
                      data-testid="orders-page_table-cell-icon"
                      className="px-2 py-4 whitespace-nowrap"
                    >
                      <span className="relative inline-flex items-center justify-center">
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          width="18"
                          height="18"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          className="text-dark-400"
                          aria-hidden="true"
                        >
                          <path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z" />
                          <line x1="3" y1="6" x2="21" y2="6" />
                          <path d="M16 10a4 4 0 0 1-8 0" />
                        </svg>
                        {order.orderStatus === "new" &&
                          order.paymentStatus === "paid" &&
                          order.status === "complete" && (
                            <span
                              className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-red-500 rounded-full"
                              aria-hidden="true"
                            />
                          )}
                      </span>
                    </td>
                    <td
                      data-testid="orders-page_table-cell-order"
                      className="px-6 py-4 whitespace-nowrap"
                    >
                      <Link
                        to={`/orders/${order.id}`}
                        onClick={saveScroll}
                        state={{ from: currentUrl }}
                        className="font-mono text-sm text-primary-600 hover:text-primary-700 dark:text-primary-400 dark:hover:text-primary-300"
                      >
                        {truncateOrderId(order.id)}
                      </Link>
                    </td>
                    <td
                      data-testid="orders-page_table-cell-order-status"
                      className="px-6 py-4 whitespace-nowrap"
                    >
                      <span
                        className={`px-2 py-1 text-xs font-medium rounded-full ${orderMetadataStatusBadge(order.orderStatus)}`}
                      >
                        {orderMetadataStatusLabel(order.orderStatus)}
                      </span>
                    </td>
                    <td
                      data-testid="orders-page_table-cell-customer"
                      className="px-6 py-4 whitespace-nowrap"
                    >
                      <div className="text-dark-900 font-medium">
                        {order.customerName || "—"}
                      </div>
                      <div className="text-sm text-dark-500">
                        {order.customerEmail || "—"}
                      </div>
                    </td>
                    <td
                      data-testid="orders-page_table-cell-total"
                      className="px-6 py-4 whitespace-nowrap"
                    >
                      <span className="text-dark-700 font-medium">
                        {formatPrice(order.amountTotal)}
                      </span>
                    </td>
                    <td
                      data-testid="orders-page_table-cell-checkout-status"
                      className="px-6 py-4 whitespace-nowrap"
                    >
                      <span
                        className={`px-2 py-1 text-xs font-medium rounded-full ${orderStatusBadge(order.status)}`}
                      >
                        {orderStatusLabel(order.status)}
                      </span>
                    </td>
                    <td
                      data-testid="orders-page_table-cell-payment"
                      className="px-6 py-4 whitespace-nowrap"
                    >
                      <span
                        className={`px-2 py-1 text-xs font-medium rounded-full ${orderPaymentStatusBadge(order.paymentStatus)}`}
                      >
                        {orderPaymentStatusLabel(order.paymentStatus)}
                      </span>
                    </td>
                    <td
                      data-testid="orders-page_table-cell-date"
                      className="px-6 py-4 whitespace-nowrap"
                    >
                      {formatDate(order.created)}
                    </td>
                    <td
                      data-testid="orders-page_table-cell-actions"
                      className="px-6 py-4 whitespace-nowrap text-right"
                    >
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
                className="bg-white p-4 rounded-xl shadow-sm border border-gray-200 dark:bg-dark-950 dark:border-gray-700"
                data-testid="orders-page_mobile-card"
              >
                <div
                  data-testid="orders-page_mobile-card-header"
                  className="flex items-center justify-between mb-3"
                >
                  <div
                    data-testid="orders-page_mobile-card-order-id"
                    className="font-mono text-sm text-primary-600 dark:text-primary-400"
                  >
                    {truncateOrderId(order.id)}
                  </div>
                  <span
                    data-testid="orders-page_mobile-card-status"
                    className={`px-2 py-1 text-xs font-medium rounded-full ${orderMetadataStatusBadge(order.orderStatus)}`}
                  >
                    {orderMetadataStatusLabel(order.orderStatus)}
                  </span>
                </div>
                <div
                  data-testid="orders-page_mobile-card-details"
                  className="grid grid-cols-2 gap-2 text-sm"
                >
                  <div
                    data-testid="orders-page_mobile-card-customer"
                    className="flex items-center justify-between col-span-2"
                  >
                    <span className="text-dark-500">Customer:</span>
                    <span className="ml-1 text-dark-700">
                      {order.customerName || "—"}
                    </span>
                  </div>
                  <div
                    data-testid="orders-page_mobile-card-email"
                    className="flex items-center justify-between col-span-2"
                  >
                    <span className="text-dark-500">Email:</span>
                    <span className="ml-1 text-dark-700">
                      {order.customerEmail || "—"}
                    </span>
                  </div>
                  <div
                    data-testid="orders-page_mobile-card-total"
                    className="flex items-center justify-between col-span-2"
                  >
                    <span className="text-dark-500">Total:</span>
                    <span className="ml-1 text-dark-700 font-medium">
                      {formatPrice(order.amountTotal)}
                    </span>
                  </div>
                  <div
                    data-testid="orders-page_mobile-card-checkout-status"
                    className="flex items-center justify-between col-span-2"
                  >
                    <span className="text-dark-500">Checkout Status:</span>
                    <span
                      className={`ml-1 px-2 py-0.5 text-xs font-medium rounded-full ${orderStatusBadge(order.status)}`}
                    >
                      {orderStatusLabel(order.status)}
                    </span>
                  </div>
                  <div
                    data-testid="orders-page_mobile-card-payment-status"
                    className="flex items-center justify-between col-span-2"
                  >
                    <span className="text-dark-500">Payment Status:</span>
                    <span
                      className={`ml-1 px-2 py-0.5 text-xs font-medium rounded-full ${orderPaymentStatusBadge(order.paymentStatus)}`}
                    >
                      {orderPaymentStatusLabel(order.paymentStatus)}
                    </span>
                  </div>
                  <div
                    data-testid="orders-page_mobile-card-date"
                    className="flex items-center justify-between col-span-2"
                  >
                    <span className="text-dark-500">Date:</span>
                    <span className="ml-1 text-dark-700">
                      {formatDate(order.created)}
                    </span>
                  </div>
                </div>
                <div
                  data-testid="orders-page_mobile-card-actions"
                  className="flex gap-2 mt-3 pt-3 border-t border-gray-200 dark:border-gray-700"
                >
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
                aria-label="Load more orders"
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
