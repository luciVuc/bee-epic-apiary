/** Dashboard overview page with stat cards, orders-by-status and category breakdowns, quick actions, and recent orders/products */
import {
  useEffect,
  useMemo,
  useCallback,
  useState,
  type ComponentType,
} from "react";
import { useDispatch, useSelector } from "react-redux";
import { Link } from "react-router-dom";
import {
  Package,
  TrendingUp,
  Star,
  AlertCircle,
  ShoppingCart,
  Plus,
  ArrowRight,
} from "lucide-react";
import type { RootState, AppDispatch } from "../store";
import { fetchProducts } from "../store/productsSlice";
import type { IDashboardStats } from "../types";
import { EProductCategory } from "../types";
import {
  DEFAULT_PRODUCT_THUMBNAIL,
  DEFAULT_CATEGORIES,
  NEW_ORDER_EVENT,
} from "../utils/constants";
import {
  formatPrice,
  formatDate,
  truncateOrderId,
  orderMetadataStatusBadge,
  orderMetadataStatusLabel,
} from "../utils/badgeClasses";
import { Spinner } from "../components/shared/Spinner";
import type { ICategory } from "../types/settings";
import type { IOrder } from "../types";
import * as api from "../utils/api";

interface IServerProductStats {
  totalProducts: number;
  inStock: number;
  featured: number;
  byCategory: Record<string, number>;
}

/** Order statuses shown in the "Orders by Status" breakdown. Mirrors the
 * metadata order_status values used in OrdersPage and orderMetadataStatus*. */
const ORDER_STATUS_BREAKDOWN: {
  value: string;
  label: string;
  color: string;
}[] = [
  { value: "new", label: "New", color: "blue" },
  { value: "pending", label: "Pending", color: "yellow" },
  { value: "fulfilled", label: "Fulfilled", color: "green" },
];

/**
 * Admin landing page: stat cards, an orders-by-status and a products-by-
 * category breakdown, quick-action links, and recent orders/products.
 * Product totals come from the server-aggregated `/products/stats` endpoint
 * (falling back to the ~5 in-store products if it fails, review I12); order
 * counts are derived by fetching each status with `limit:1` and reading
 * `totalCount` since there is no orders-stats endpoint. Refreshes on
 * `NEW_ORDER_EVENT` from the notifications stream.
 */
export function DashboardPage() {
  const dispatch = useDispatch<AppDispatch>();
  const { items: products, loading } = useSelector(
    (state: RootState) => state.products,
  );
  const [categories, setCategories] = useState<ICategory[]>([]);
  const [orderStatusCounts, setOrderStatusCounts] = useState<
    Record<string, number>
  >({});
  const [recentOrders, setRecentOrders] = useState<IOrder[]>([]);
  const [serverStats, setServerStats] = useState<IServerProductStats | null>(
    null,
  );

  const newOrdersCount = orderStatusCounts.new ?? 0;
  const totalOrders = ORDER_STATUS_BREAKDOWN.reduce(
    (sum, { value }) => sum + (orderStatusCounts[value] ?? 0),
    0,
  );

  const fetchOrderStatusCounts = useCallback(() => {
    // No server-side orders-stats endpoint exists, so fetch each status with
    // limit:1 and read totalCount (same trick the New Orders card has always
    // used). Only paid orders count toward the breakdown.
    ORDER_STATUS_BREAKDOWN.forEach(({ value }) => {
      api.api
        .getOrders({ order_status: value, payment_status: "paid", limit: 1 })
        .then((result) =>
          setOrderStatusCounts((prev) => ({
            ...prev,
            [value]: result.totalCount,
          })),
        )
        .catch(() => {});
    });
  }, []);

  const fetchRecentOrders = useCallback(() => {
    // Newest paid orders for the Recent Orders card. The worker returns
    // sessions newest-first, so the first 5 are the most recent.
    api.api
      .getOrders({ payment_status: "paid", limit: 5 })
      .then((result) => setRecentOrders(result.orders))
      .catch(() => {});
  }, []);

  useEffect(() => {
    // Pull aggregated stats from the worker — replaces fetching 100 products
    // and aggregating client-side every dashboard load (review I12). Recent
    // products section still needs the row data, but only the first 5.
    dispatch(fetchProducts({ limit: 5 }));
    api.api
      .getProductsStats()
      .then((s) => setServerStats(s))
      .catch(() => setServerStats(null));
    api.api
      .getSettings<ICategory[]>("categories")
      .then((cats) => {
        setCategories(cats || []);
      })
      .catch(() => {});
  }, [dispatch]);

  useEffect(() => {
    fetchOrderStatusCounts();
    fetchRecentOrders();
    const handleNewOrder = () => {
      fetchOrderStatusCounts();
      fetchRecentOrders();
    };
    window.addEventListener(NEW_ORDER_EVENT, handleNewOrder);
    return () => window.removeEventListener(NEW_ORDER_EVENT, handleNewOrder);
  }, [fetchOrderStatusCounts, fetchRecentOrders]);

  const stats: IDashboardStats = useMemo(() => {
    // Prefer server-aggregated stats; fall back to client-side over the
    // (limited) products in store if /products/stats failed. The fallback
    // numbers will be wrong for tenants with >5 products, but the dashboard
    // remains usable instead of crashing.
    const byCategoryServer = serverStats?.byCategory ?? {};
    const honeyProducts =
      byCategoryServer[EProductCategory.HONEY] ??
      products.filter((p) => p.category === EProductCategory.HONEY).length;
    const beeswaxProducts =
      byCategoryServer[EProductCategory.BEESWAX] ??
      products.filter((p) => p.category === EProductCategory.BEESWAX).length;
    const giftProducts =
      byCategoryServer[EProductCategory.GIFTS] ??
      products.filter((p) => p.category === EProductCategory.GIFTS).length;
    const subscriptionProducts =
      byCategoryServer[EProductCategory.SUBSCRIPTIONS] ??
      products.filter((p) => p.category === EProductCategory.SUBSCRIPTIONS)
        .length;

    return {
      totalProducts: serverStats?.totalProducts ?? products.length,
      inStockProducts:
        serverStats?.inStock ?? products.filter((p) => p.inStock).length,
      featuredProducts:
        serverStats?.featured ?? products.filter((p) => p.featured).length,
      totalCategories: categories.length || 4,
      honeyProducts,
      beeswaxProducts,
      giftProducts,
      subscriptionProducts,
    };
  }, [products, categories, serverStats]);

  if (loading) {
    return <Spinner />;
  }

  return (
    <div data-testid="dashboard-page">
      <div
        data-testid="dashboard-page_header"
        className="sticky top-0 z-20 bg-white border-b border-gray-200 px-4 py-4 mb-6 flex items-center justify-between dark:bg-dark-950 dark:border-gray-700"
      >
        <h2
          className="font-heading text-3xl font-bold text-dark-900"
          data-testid="dashboard-page_title"
        >
          Dashboard
        </h2>
        <Link
          to="/products/new"
          data-testid="dashboard-page_add-product-link"
          className="flex items-center gap-2 px-4 py-2 bg-primary-500 text-white rounded-lg hover:bg-primary-600 transition-colors"
        >
          <Plus className="w-4 h-4" aria-hidden="true" />
          Add Product
        </Link>
      </div>

      {/* Stats Grid */}
      <div
        data-testid="dashboard-page_stats-grid"
        className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8"
      >
        <StatCard
          data-testid="dashboard-page_stat-card_new-orders"
          title="New Orders"
          value={newOrdersCount}
          icon={ShoppingCart}
          color="red"
        />
        <StatCard
          data-testid="dashboard-page_stat-card_total-active-products"
          title="Total Active Products"
          value={stats.totalProducts}
          icon={Package}
          color="blue"
        />
        <StatCard
          title="In Stock"
          value={stats.inStockProducts}
          icon={TrendingUp}
          color="green"
        />
        <StatCard
          data-testid="dashboard-page_stat-card_featured-products"
          title="Featured"
          value={stats.featuredProducts}
          icon={Star}
          color="yellow"
        />
        <StatCard
          data-testid="dashboard-page_stat-card_total-categories"
          title="Categories"
          value={stats.totalCategories}
          icon={AlertCircle}
          color="purple"
        />
      </div>

      {/* Orders by Status and Category Breakdown Grid */}
      <div
        data-testid="dashboard-page_status-grid"
        className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8"
      >
        {/* Orders by Status */}
        <div
          data-testid="dashboard-page_orders-by-status"
          className="bg-white rounded-xl p-6 shadow-sm border border-gray-200 dark:bg-dark-950 dark:border-gray-700"
        >
          <div
            data-testid="dashboard-page_orders-by-status_header"
            className="flex items-center justify-between mb-4"
          >
            <h3
              data-testid="dashboard-page_orders-by-status_header-title"
              className="font-heading text-xl font-semibold dark:text-dark-800"
            >
              Orders by Status
            </h3>
            <Link
              data-testid="dashboard-page_orders-by-status_view-all-link"
              to="/orders"
              className="text-primary-500 hover:text-primary-600 text-sm font-medium dark:text-primary-400 dark:hover:text-primary-300"
            >
              View All →
            </Link>
          </div>
          <div
            data-testid="dashboard-page_orders-by-status_content"
            className="space-y-3"
          >
            {ORDER_STATUS_BREAKDOWN.map(({ value, label, color }) => {
              const count = orderStatusCounts[value] ?? 0;
              return (
                <CategoryBar
                  data-testid={`dashboard-page_orders-by-status_category-bar-${value}`}
                  key={value}
                  label={label}
                  count={count}
                  total={totalOrders}
                  color={color}
                />
              );
            })}
          </div>
        </div>

        {/* Category Breakdown */}
        <div
          data-testid="dashboard-page_category-breakdown"
          className="bg-white rounded-xl p-6 shadow-sm border border-gray-200 dark:bg-dark-950 dark:border-gray-700"
        >
          <h3
            data-testid="dashboard-page_category-breakdown_header-title"
            className="font-heading text-xl font-semibold mb-4 dark:text-dark-800"
          >
            Products by Category
          </h3>
          <div
            data-testid="dashboard-page_category-breakdown_content"
            className="space-y-3"
          >
            {categories.length > 0
              ? categories.map((cat, i) => {
                  // Use the server-aggregated byCategory map; fall back to the
                  // in-memory product list (which only has ~5 entries now) so
                  // the dashboard degrades gracefully if /products/stats fails.
                  const count =
                    serverStats?.byCategory[cat.id] ??
                    products.filter((p) => p.category === cat.id).length;
                  const colors = [
                    "amber",
                    "yellow",
                    "pink",
                    "blue",
                    "green",
                    "indigo",
                    "purple",
                    "red",
                  ];
                  return (
                    <CategoryBar
                      key={cat.id}
                      label={cat.label}
                      count={count}
                      total={stats.totalProducts}
                      color={colors[i % colors.length]}
                    />
                  );
                })
              : DEFAULT_CATEGORIES.map((cat) => {
                  const countMap: Record<string, number> = {
                    HONEY: stats.honeyProducts,
                    BEESWAX: stats.beeswaxProducts,
                    GIFTS: stats.giftProducts,
                    SUBSCRIPTIONS: stats.subscriptionProducts,
                  };
                  const colors = [
                    "amber",
                    "yellow",
                    "pink",
                    "blue",
                    "green",
                    "indigo",
                    "purple",
                    "red",
                  ];
                  return (
                    <CategoryBar
                      key={cat.id}
                      label={cat.label}
                      count={countMap[cat.id] || 0}
                      total={stats.totalProducts}
                      color={
                        colors[DEFAULT_CATEGORIES.indexOf(cat) % colors.length]
                      }
                    />
                  );
                })}
          </div>
        </div>
      </div>

      <div
        data-testid="dashboard-page_category-breakdown-grid"
        className="grid grid-cols-1 gap-6 mb-8"
      >
        {/* Quick Actions */}
        <div
          data-testid="dashboard-page_quick-actions"
          className="bg-white rounded-xl p-6 shadow-sm border border-gray-200 dark:bg-dark-950 dark:border-gray-700"
        >
          <h3
            data-testid="dashboard-page_quick-actions_title"
            className="font-heading text-xl font-semibold mb-4 dark:text-dark-800"
          >
            Quick Actions
          </h3>
          <div
            data-testid="dashboard-page_quick-actions_list"
            className="space-y-3"
          >
            <Link
              data-testid="dashboard-page_quick-actions_view-orders-link"
              to="/orders"
              className="flex items-center justify-between p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors dark:bg-dark-100 dark:hover:bg-dark-200"
            >
              <span className="font-medium text-dark-700 dark:text-dark-800">
                View Orders
              </span>
              <ArrowRight
                className="w-4 h-4 text-dark-400 dark:text-dark-400"
                aria-hidden="true"
              />
            </Link>
            <Link
              data-testid="dashboard-page_quick-actions_manage-products-link"
              to="/products"
              className="flex items-center justify-between p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors dark:bg-dark-100 dark:hover:bg-dark-200"
            >
              <span className="font-medium text-dark-700 dark:text-dark-800">
                Manage Products
              </span>
              <ArrowRight
                className="w-4 h-4 text-dark-400 dark:text-dark-400"
                aria-hidden="true"
              />
            </Link>
            <Link
              data-testid="dashboard-page_quick-actions_add-product-link"
              to="/products/new"
              className="flex items-center justify-between p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors dark:bg-dark-100 dark:hover:bg-dark-200"
            >
              <span className="font-medium text-dark-700 dark:text-dark-800">
                Add New Product
              </span>
              <ArrowRight
                className="w-4 h-4 text-dark-400 dark:text-dark-400"
                aria-hidden="true"
              />
            </Link>
            <Link
              data-testid="dashboard-page_quick-actions_update-settings-link"
              to="/settings"
              className="flex items-center justify-between p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors dark:bg-dark-100 dark:hover:bg-dark-200"
            >
              <span className="font-medium text-dark-700 dark:text-dark-800">
                Update Settings
              </span>
              <ArrowRight
                className="w-4 h-4 text-dark-400 dark:text-dark-400"
                aria-hidden="true"
              />
            </Link>
          </div>
        </div>
      </div>

      {/* Recent Orders */}
      <div
        data-testid="dashboard-page_recent-orders"
        className="bg-white rounded-xl p-6 shadow-sm border border-gray-200 mb-8 dark:bg-dark-950 dark:border-gray-700"
      >
        <div
          data-testid="dashboard-page_recent-orders_title"
          className="flex items-center justify-between mb-4"
        >
          <h3
            data-testid="dashboard-page_recent-orders_title-text"
            className="font-heading text-xl font-semibold dark:text-dark-800"
          >
            Recent Orders
          </h3>
          <Link
            data-testid="dashboard-page_recent-orders_view-all-link"
            to="/orders"
            className="text-primary-500 hover:text-primary-600 text-sm font-medium dark:text-primary-400 dark:hover:text-primary-300"
          >
            View All →
          </Link>
        </div>
        <div
          data-testid="dashboard-page_recent-orders_list"
          className="space-y-3"
        >
          {recentOrders.length === 0 ? (
            <p
              data-testid="dashboard-page_recent-orders_empty"
              className="text-sm text-dark-500 dark:text-dark-400"
            >
              No orders yet.
            </p>
          ) : (
            recentOrders.map((order) => (
              <Link
                data-testid={`dashboard-page_recent-orders_order-${order.id}`}
                key={order.id}
                to={`/orders/${order.id}`}
                className="flex items-center gap-4 p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors dark:bg-dark-100 dark:hover:bg-dark-200"
              >
                <div className="w-12 h-12 rounded-lg bg-primary-50 flex items-center justify-center dark:bg-primary-900/30">
                  <ShoppingCart
                    className="w-5 h-5 text-primary-600 dark:text-primary-300"
                    aria-hidden="true"
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <h4 className="font-medium text-dark-800 truncate">
                    {order.customerName || order.customerEmail || "Guest"}
                  </h4>
                  <p className="text-sm text-dark-500">
                    <span className="font-mono">
                      {truncateOrderId(order.id)}
                    </span>{" "}
                    • {formatDate(order.created)}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-medium text-dark-800 dark:text-dark-700">
                    {formatPrice(order.amountTotal, order.currency)}
                  </span>
                  <span
                    className={`px-2 py-1 text-xs rounded-full ${orderMetadataStatusBadge(order.orderStatus)}`}
                  >
                    {orderMetadataStatusLabel(order.orderStatus)}
                  </span>
                </div>
              </Link>
            ))
          )}
        </div>
      </div>

      {/* Recent Products */}
      <div
        data-testid="dashboard-page_recent-products"
        className="bg-white rounded-xl p-6 shadow-sm border border-gray-200 dark:bg-dark-950 dark:border-gray-700"
      >
        <div
          data-testid="dashboard-page_recent-products_title"
          className="flex items-center justify-between mb-4"
        >
          <h3
            data-testid="dashboard-page_recent-products_title-text"
            className="font-heading text-xl font-semibold dark:text-dark-800"
          >
            Recent Products
          </h3>
          <Link
            data-testid="dashboard-page_recent-products_view-all-link"
            to="/products"
            className="text-primary-500 hover:text-primary-600 text-sm font-medium dark:text-primary-400 dark:hover:text-primary-300"
          >
            View All →
          </Link>
        </div>
        <div
          data-testid="dashboard-page_recent-products_list"
          className="space-y-3"
        >
          {products.slice(0, 5).map((product) => (
            <Link
              data-testid={`dashboard-page_recent-products_product-${product.id}`}
              key={product.id}
              to={`/products/${product.id}`}
              className="flex items-center gap-4 p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors dark:bg-dark-100 dark:hover:bg-dark-200"
            >
              <img
                src={product.thumbnailUrls[0] || DEFAULT_PRODUCT_THUMBNAIL}
                alt={product.name}
                loading="lazy"
                className="w-12 h-12 rounded-lg object-cover"
              />
              <div className="flex-1">
                <h4 className="font-medium text-dark-800">{product.name}</h4>
                <p className="text-sm text-dark-500">
                  {formatPrice(product.price, "usd")} • {product.category}
                </p>
                {product.recurringInterval && (
                  <p className="text-xs text-blue-600">
                    every {product.recurringIntervalCount || 1}{" "}
                    {product.recurringInterval}
                    {(product.recurringIntervalCount || 1) > 1 ? "s" : ""}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-2">
                {product.category === EProductCategory.SUBSCRIPTIONS && (
                  <span className="px-2 py-1 text-xs rounded-full bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">
                    Subscription
                  </span>
                )}
                <span
                  className={`px-2 py-1 text-xs rounded-full ${
                    product.inStock
                      ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300"
                      : "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300"
                  }`}
                >
                  {product.inStock ? "In Stock" : "Out of Stock"}
                </span>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}

/** Single dashboard metric tile: label, numeric value, and a colored icon. */
function StatCard({
  title,
  value,
  icon: Icon,
  color,
}: {
  title: string;
  value: number;
  icon: ComponentType<{ className?: string }>;
  color: string;
}) {
  const colorClasses = {
    blue: "bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-300",
    green:
      "bg-green-50 text-green-600 dark:bg-green-900/30 dark:text-green-300",
    yellow:
      "bg-yellow-50 text-yellow-600 dark:bg-yellow-900/30 dark:text-yellow-300",
    purple:
      "bg-purple-50 text-purple-600 dark:bg-purple-900/30 dark:text-purple-300",
    red: "bg-red-50 text-red-600 dark:bg-red-900/30 dark:text-red-300",
  };

  return (
    <div
      className="bg-white rounded-xl p-6 shadow-sm border border-gray-200 dark:bg-dark-950 dark:border-gray-700"
      data-testid={`stat-card`}
    >
      <div className="flex items-center justify-between mb-4">
        <span className="text-dark-500 text-sm dark:text-dark-400">
          {title}
        </span>
        <div
          className={`w-10 h-10 rounded-lg flex items-center justify-center ${colorClasses[color as keyof typeof colorClasses]}`}
        >
          <Icon className="w-5 h-5" />
        </div>
      </div>
      <div className="font-heading text-3xl font-bold text-dark-900 dark:text-dark-800">
        {value}
      </div>
    </div>
  );
}

/**
 * Labeled horizontal bar showing `count` as a percentage of `total`. Used for
 * both the orders-by-status and products-by-category breakdowns; renders 0%
 * safely when `total` is 0.
 */
function CategoryBar({
  label,
  count,
  total,
  color,
}: {
  label: string;
  count: number;
  total: number;
  color: string;
}) {
  const percentage = total > 0 ? (count / total) * 100 : 0;
  const colorClasses: Record<string, string> = {
    amber: "bg-amber-500",
    yellow: "bg-yellow-500",
    pink: "bg-pink-500",
    blue: "bg-blue-500",
    green: "bg-green-500",
    indigo: "bg-indigo-500",
    purple: "bg-purple-500",
    red: "bg-red-500",
  };

  return (
    <div data-testid={`category-bar`}>
      <div className="flex items-center justify-between mb-1">
        <span className="text-sm font-medium text-dark-700">{label}</span>
        <span className="text-sm text-dark-500">
          {count} ({total > 0 ? Math.round(percentage) : 0}%)
        </span>
      </div>
      <div
        className="w-full h-2 bg-gray-200 rounded-full overflow-hidden dark:bg-gray-700"
        role="progressbar"
        aria-valuenow={count}
        aria-valuemin={0}
        aria-valuemax={total}
        aria-label={label}
      >
        <div
          className={`h-full ${colorClasses[color as keyof typeof colorClasses]}`}
          style={{ width: `${percentage}%` }}
        ></div>
      </div>
    </div>
  );
}
