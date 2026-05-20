import { useEffect, useMemo, type ComponentType } from "react";
import { useDispatch, useSelector } from "react-redux";
import { Link } from "react-router-dom";
import {
  Package,
  TrendingUp,
  Star,
  AlertCircle,
  Plus,
  ArrowRight,
} from "lucide-react";
import type { RootState, AppDispatch } from "../store";
import { fetchProducts, fetchProductsCount } from "../store/productsSlice";
import { useState } from "react";
import type { IDashboardStats } from "../types";
import { EProductCategory } from "../types";
import { DEFAULT_PRODUCT_THUMBNAIL } from "../utils/constants";
import type { ICategory } from "../types/settings";
import * as api from "../utils/api";

export function DashboardPage() {
  const dispatch = useDispatch<AppDispatch>();
  const { items: products, loading } = useSelector(
    (state: RootState) => state.products,
  );
  const [categories, setCategories] = useState<ICategory[]>([]);

  useEffect(() => {
    dispatch(fetchProducts({ limit: 100 }));
    dispatch(fetchProductsCount());
    api.api
      .getSettings<ICategory[]>("categories")
      .then((cats) => {
        setCategories(cats || []);
      })
      .catch(() => {});
  }, [dispatch]);

  const stats: IDashboardStats = useMemo(() => {
    const honeyProducts = products.filter(
      (p) => p.category === EProductCategory.HONEY,
    ).length;
    const beeswaxProducts = products.filter(
      (p) => p.category === EProductCategory.BEESWAX,
    ).length;
    const giftProducts = products.filter(
      (p) => p.category === EProductCategory.GIFTS,
    ).length;
    const subscriptionProducts = products.filter(
      (p) => p.category === EProductCategory.SUBSCRIPTIONS,
    ).length;

    return {
      totalProducts: products.length,
      inStockProducts: products.filter((p) => p.inStock).length,
      featuredProducts: products.filter((p) => p.featured).length,
      totalCategories: categories.length || 4,
      honeyProducts,
      beeswaxProducts,
      giftProducts,
      subscriptionProducts,
    };
  }, [products, categories]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-500"></div>
      </div>
    );
  }

  return (
    <div>
      <div className="sticky top-0 z-20 bg-white border-b border-gray-200 px-4 py-4 mb-6 flex items-center justify-between">
        <h2 className="font-heading text-3xl font-bold text-dark-900">
          Dashboard
        </h2>
        <Link
          to="/products/new"
          className="flex items-center gap-2 px-4 py-2 bg-primary-500 text-white rounded-lg hover:bg-primary-600 transition-colors"
        >
          <Plus className="w-4 h-4" />
          Add Product
        </Link>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <StatCard
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
          title="Featured"
          value={stats.featuredProducts}
          icon={Star}
          color="yellow"
        />
        <StatCard
          title="Categories"
          value={stats.totalCategories}
          icon={AlertCircle}
          color="purple"
        />
      </div>

      {/* Category Breakdown */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200">
          <h3 className="font-heading text-xl font-semibold mb-4">
            Products by Category
          </h3>
          <div className="space-y-3">
            {categories.length > 0 ? (
              categories.map((cat, i) => {
                const count = products.filter(
                  (p) => p.category === cat.id,
                ).length;
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
            ) : (
              <>
                <CategoryBar
                  label="Honey"
                  count={stats.honeyProducts}
                  total={stats.totalProducts}
                  color="amber"
                />
                <CategoryBar
                  label="Beeswax"
                  count={stats.beeswaxProducts}
                  total={stats.totalProducts}
                  color="yellow"
                />
                <CategoryBar
                  label="Gift Sets"
                  count={stats.giftProducts}
                  total={stats.totalProducts}
                  color="pink"
                />
                <CategoryBar
                  label="Subscriptions"
                  count={stats.subscriptionProducts}
                  total={stats.totalProducts}
                  color="blue"
                />
              </>
            )}
          </div>
        </div>

        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200">
          <h3 className="font-heading text-xl font-semibold mb-4">
            Quick Actions
          </h3>
          <div className="space-y-3">
            <Link
              to="/products"
              className="flex items-center justify-between p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
            >
              <span className="font-medium text-dark-700">Manage Products</span>
              <ArrowRight className="w-4 h-4 text-dark-400" />
            </Link>
            <Link
              to="/products/new"
              className="flex items-center justify-between p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
            >
              <span className="font-medium text-dark-700">Add New Product</span>
              <ArrowRight className="w-4 h-4 text-dark-400" />
            </Link>
            <Link
              to="/settings"
              className="flex items-center justify-between p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
            >
              <span className="font-medium text-dark-700">Update Settings</span>
              <ArrowRight className="w-4 h-4 text-dark-400" />
            </Link>
          </div>
        </div>
      </div>

      {/* Recent Products */}
      <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-heading text-xl font-semibold">
            Recent Products
          </h3>
          <Link
            to="/products"
            className="text-primary-500 hover:text-primary-600 text-sm font-medium"
          >
            View All →
          </Link>
        </div>
        <div className="space-y-3">
          {products.slice(0, 5).map((product) => (
            <Link
              key={product.id}
              to={`/products/${product.id}`}
              className="flex items-center gap-4 p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
            >
              <img
                src={product.thumbnailUrls[0] || DEFAULT_PRODUCT_THUMBNAIL}
                alt={product.name}
                className="w-12 h-12 rounded-lg object-cover"
              />
              <div className="flex-1">
                <h4 className="font-medium text-dark-800">{product.name}</h4>
                <p className="text-sm text-dark-500">
                  ${(product.price / 100).toFixed(2)} • {product.category}
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
                  <span className="px-2 py-1 text-xs rounded-full bg-blue-100 text-blue-700">
                    Subscription
                  </span>
                )}
                <span
                  className={`px-2 py-1 text-xs rounded-full ${
                    product.inStock
                      ? "bg-green-100 text-green-700"
                      : "bg-red-100 text-red-700"
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
    blue: "bg-blue-50 text-blue-600",
    green: "bg-green-50 text-green-600",
    yellow: "bg-yellow-50 text-yellow-600",
    purple: "bg-purple-50 text-purple-600",
  };

  return (
    <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200">
      <div className="flex items-center justify-between mb-4">
        <span className="text-dark-500 text-sm">{title}</span>
        <div
          className={`w-10 h-10 rounded-lg flex items-center justify-center ${colorClasses[color as keyof typeof colorClasses]}`}
        >
          <Icon className="w-5 h-5" />
        </div>
      </div>
      <div className="font-heading text-3xl font-bold text-dark-900">
        {value}
      </div>
    </div>
  );
}

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
  const colorClasses = {
    amber: "bg-amber-500",
    yellow: "bg-yellow-500",
    pink: "bg-pink-500",
    blue: "bg-blue-500",
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-sm font-medium text-dark-700">{label}</span>
        <span className="text-sm text-dark-500">
          {count} ({total > 0 ? Math.round(percentage) : 0}%)
        </span>
      </div>
      <div className="w-full h-2 bg-gray-200 rounded-full overflow-hidden">
        <div
          className={`h-full ${colorClasses[color as keyof typeof colorClasses]}`}
          style={{ width: `${percentage}%` }}
        ></div>
      </div>
    </div>
  );
}
