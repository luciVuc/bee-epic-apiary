/** Single order detail page with customer info, status cards, line items, and edit actions */
import { useEffect, useRef, useState } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import { useDispatch, useSelector } from "react-redux";
import { ArrowLeft, Edit, ExternalLink, AlertCircle } from "lucide-react";
import { Link } from "react-router-dom";
import type { RootState, AppDispatch } from "../store";
import {
  fetchOrderById,
  updateOrder,
  setSelectedOrder,
} from "../store/ordersSlice";
import { Spinner } from "../components/shared/Spinner";
import type { IOrder } from "../types";
import {
  orderStatusBadge,
  orderStatusLabel,
  orderPaymentStatusBadge,
  orderPaymentStatusLabel,
  orderModeBadge,
  orderModeLabel,
  formatPrice,
  formatDate,
} from "../utils/badgeClasses";

function getBackUrl(location: ReturnType<typeof useLocation>): string {
  return (location.state as { from?: string } | null)?.from || "/orders";
}

export function OrderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const location = useLocation();
  const dispatch = useDispatch<AppDispatch>();
  const navigate = useNavigate();
  const {
    selectedOrder: order,
    selectedOrderLineItems: lineItems,
    loading,
    error,
  } = useSelector((state: RootState) => state.orders);
  const fetchedId = useRef<string | undefined>(undefined);

  const isEditMode = location.pathname.endsWith("/edit");

  useEffect(() => {
    if (id && fetchedId.current !== id) {
      fetchedId.current = id;
      dispatch(fetchOrderById(id));
    }
    return () => {
      dispatch(setSelectedOrder(null));
    };
  }, [dispatch, id]);

  const handleEdit = () => {
    navigate(`/orders/${id}/edit`, {
      replace: true,
      state: { from: getBackUrl(location) },
    });
  };

  const handleCloseDialog = () => {
    navigate(`/orders/${id}`, {
      replace: true,
      state: { from: getBackUrl(location) },
    });
  };

  if (error) {
    return (
      <div className="text-center py-12" data-testid="order-detail-page_error">
        <AlertCircle className="w-16 h-16 text-red-500 mx-auto mb-4" />
        <h2 className="text-2xl font-bold text-red-600 mb-4">
          Order Not Found
        </h2>
        <p className="text-dark-600 mb-6">
          The requested order could not be loaded.
        </p>
        <Link
          to={getBackUrl(location)}
          className="inline-flex items-center gap-2 px-4 py-2 bg-primary-500 text-white rounded-lg hover:bg-primary-600 transition-colors"
        >
          Back to Orders
        </Link>
      </div>
    );
  }

  if (loading || !order) {
    return <Spinner />;
  }

  if (isEditMode) {
    return <OrderEditDialog order={order} onClose={handleCloseDialog} />;
  }

  const backUrl = getBackUrl(location);

  return (
    <div data-testid="order-detail-page">
      <div
        data-testid="order-detail-page_header"
        className="sticky top-0 z-20 bg-white border-b border-gray-200 px-4 py-4 flex items-start justify-between mb-6"
      >
        <div
          data-testid="order-detail-page_header-content"
          className="flex items-start gap-4"
        >
          <button
            data-testid="order-detail-page_back-button"
            onClick={() => navigate(backUrl)}
            aria-label="Back to orders"
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <ArrowLeft className="w-5 h-5 text-dark-600" />
          </button>
          <div>
            <h2
              data-testid="order-detail-page_id"
              className="font-heading text-3xl font-bold text-dark-900 font-mono"
            >
              {order.id.slice(0, 20)}...
            </h2>
            <p className="text-sm text-dark-500 mt-1">
              {formatDate(order.created)}
            </p>
          </div>
        </div>
        <div
          data-testid="order-detail-page_header-actions"
          className="flex gap-3"
        >
          {order.url && (
            <a
              href={order.url}
              target="_blank"
              rel="noopener noreferrer"
              data-testid="order-detail-page_checkout-link"
              className="flex items-center gap-2 px-4 py-2 bg-gray-100 text-dark-700 rounded-lg hover:bg-gray-200 transition-colors"
              title="Open Checkout Session"
            >
              <ExternalLink className="w-4 h-4" />
              <span className="hidden md:block">Checkout URL</span>
            </a>
          )}
          <button
            data-testid="order-detail-page_edit-button"
            onClick={handleEdit}
            className="flex items-center gap-2 px-4 py-2 bg-primary-500 text-white rounded-lg hover:bg-primary-600 transition-colors"
            title="Edit Order Metadata"
          >
            <Edit className="w-4 h-4" />
            <span
              data-testid="order-detail-page_edit-button_text"
              className="hidden md:block"
            >
              Edit
            </span>
          </button>
        </div>
      </div>

      <div
        data-testid="order-detail-page_content"
        className="grid grid-cols-1 lg:grid-cols-3 gap-6"
      >
        <div
          data-testid="order-detail-page_main-content"
          className="lg:col-span-2 space-y-6"
        >
          {/* Line Items */}
          <div
            data-testid="order-detail-page_line-items"
            className="bg-white rounded-xl p-6 shadow-sm border border-gray-200"
          >
            <h3
              data-testid="order-detail-page_line-items_header"
              className="font-heading text-xl font-semibold mb-4"
            >
              Order Items
            </h3>
            {lineItems.length === 0 ? (
              <p className="text-dark-500">No line items available</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-dark-500 uppercase tracking-wider">
                        Item
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-dark-500 uppercase tracking-wider">
                        Qty
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-dark-500 uppercase tracking-wider">
                        Subtotal
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-dark-500 uppercase tracking-wider">
                        Total
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {lineItems.map((item) => (
                      <tr
                        key={item.id}
                        className="hover:bg-gray-50 transition-colors"
                      >
                        <td className="px-4 py-3">
                          <div className="text-dark-900">
                            {item.description}
                          </div>
                          {item.price && (
                            <div className="text-xs text-dark-500 font-mono mt-0.5">
                              {item.price.id}
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right text-dark-700">
                          {item.quantity || 1}
                        </td>
                        <td className="px-4 py-3 text-right text-dark-700">
                          {formatPrice(item.amountSubtotal)}
                        </td>
                        <td className="px-4 py-3 text-right text-dark-900 font-medium">
                          {formatPrice(item.amountTotal)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-gray-50 border-t-2 border-gray-200">
                    <tr>
                      <td
                        colSpan={3}
                        className="px-4 py-3 text-right text-sm font-medium text-dark-600"
                      >
                        Subtotal
                      </td>
                      <td className="px-4 py-3 text-right text-dark-900 font-medium">
                        {formatPrice(order.amountSubtotal)}
                      </td>
                    </tr>
                    <tr>
                      <td
                        colSpan={3}
                        className="px-4 py-3 text-right text-sm font-medium text-dark-600"
                      >
                        Total
                      </td>
                      <td className="px-4 py-3 text-right text-dark-900 font-bold text-lg">
                        {formatPrice(order.amountTotal)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>

          {/* Metadata */}
          {Object.keys(order.metadata).length > 0 && (
            <div
              data-testid="order-detail-page_metadata"
              className="bg-white rounded-xl p-6 shadow-sm border border-gray-200"
            >
              <h3
                data-testid="order-detail-page_metadata_header"
                className="font-heading text-xl font-semibold mb-4"
              >
                Order Metadata
              </h3>
              <div className="space-y-2">
                {Object.entries(order.metadata).map(([key, value]) => (
                  <div
                    key={key}
                    className="flex items-center justify-between py-1 border-b border-gray-100 last:border-0"
                  >
                    <span className="text-sm text-dark-500 font-mono">
                      {key}
                    </span>
                    <span className="text-sm text-dark-700">{value}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div data-testid="order-detail-page_sidebar" className="space-y-6">
          {/* Status Card */}
          <div
            data-testid="order-detail-page_status"
            className="bg-white rounded-xl p-6 shadow-sm border border-gray-200"
          >
            <h3
              data-testid="order-detail-page_status_header"
              className="font-heading text-lg font-semibold mb-4"
            >
              Status
            </h3>
            <div
              data-testid="order-detail-page_status_content"
              className="space-y-3"
            >
              <div className="flex items-center justify-between">
                <span className="text-dark-600">Checkout Status</span>
                <span
                  className={`px-2 py-1 text-xs font-medium rounded-full ${orderStatusBadge(order.status)}`}
                >
                  {orderStatusLabel(order.status)}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-dark-600">Payment Status</span>
                <span
                  className={`px-2 py-1 text-xs font-medium rounded-full ${orderPaymentStatusBadge(order.paymentStatus)}`}
                >
                  {orderPaymentStatusLabel(order.paymentStatus)}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-dark-600">Type</span>
                <span
                  className={`px-2 py-1 text-xs font-medium rounded-full ${orderModeBadge(order.mode)}`}
                >
                  {orderModeLabel(order.mode)}
                </span>
              </div>
            </div>
          </div>

          {/* Customer Card */}
          <div
            data-testid="order-detail-page_customer"
            className="bg-white rounded-xl p-6 shadow-sm border border-gray-200"
          >
            <h3
              data-testid="order-detail-page_customer_header"
              className="font-heading text-lg font-semibold mb-4"
            >
              Customer
            </h3>
            <div
              data-testid="order-detail-page_customer_content"
              className="space-y-3"
            >
              <div className="flex items-center justify-between">
                <span className="text-sm text-dark-500">Name</span>
                <p className="text-dark-700 font-medium">
                  {order.customerName || "—"}
                </p>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-dark-500">Email</span>
                <p className="text-dark-700">{order.customerEmail || "—"}</p>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-dark-500">Phone</span>
                <p className="text-dark-700">{order.customerPhone || "—"}</p>
              </div>
            </div>
          </div>

          {/* Details Card */}
          <div
            data-testid="order-detail-page_details"
            className="bg-white rounded-xl p-6 shadow-sm border border-gray-200"
          >
            <h3
              data-testid="order-detail-page_details_header"
              className="font-heading text-lg font-semibold mb-4"
            >
              Details
            </h3>
            <div
              data-testid="order-detail-page_details_content"
              className="space-y-3"
            >
              <div className="flex items-center justify-between">
                <span className="text-sm text-dark-500">Order ID</span>
                <p className="text-dark-700 font-mono text-xs break-all">
                  {order.id}
                </p>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-dark-500">Subtotal</span>
                <p className="text-dark-700 font-medium">
                  {formatPrice(order.amountSubtotal)}
                </p>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-dark-500">Total</span>
                <p className="text-dark-900 font-bold text-lg">
                  {formatPrice(order.amountTotal)}
                </p>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-dark-500">Currency</span>
                <p className="text-dark-700 font-medium uppercase">
                  {order.currency}
                </p>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-dark-500">Created</span>
                <p className="text-dark-700 text-sm">
                  {formatDate(order.created)}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function OrderEditDialog({
  order,
  onClose,
}: {
  order: IOrder;
  onClose: () => void;
}) {
  const dispatch = useDispatch<AppDispatch>();
  const [metadataJson, setMetadataJson] = useState(
    JSON.stringify(order.metadata, null, 2),
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async () => {
    try {
      setSaving(true);
      setError(null);
      const parsed = JSON.parse(metadataJson);
      if (
        typeof parsed !== "object" ||
        parsed === null ||
        Array.isArray(parsed)
      ) {
        setError("Metadata must be a JSON object");
        setSaving(false);
        return;
      }
      const clean: Record<string, string> = {};
      for (const [k, v] of Object.entries(parsed)) {
        clean[k] = String(v);
      }
      await dispatch(updateOrder({ id: order.id, metadata: clean })).unwrap();
      onClose();
    } catch (err) {
      if (err instanceof SyntaxError) {
        setError("Invalid JSON format");
      } else {
        setError("Failed to update order metadata");
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="order-edit-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      data-testid="order-edit-dialog"
    >
      <div className="bg-white rounded-xl shadow-xl max-w-lg w-full mx-4 max-h-[90vh] overflow-y-auto">
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
          <h3
            id="order-edit-title"
            className="font-heading text-xl font-semibold text-dark-900"
          >
            Edit Order Metadata
          </h3>
          <button
            onClick={onClose}
            aria-label="Close"
            className="p-1 hover:bg-gray-100 rounded"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
        </div>
        <div className="px-6 py-4 space-y-4">
          <p className="text-sm text-dark-500">
            Update metadata for order{" "}
            <span className="font-mono">{order.id.slice(0, 20)}...</span>
          </p>
          {error && (
            <div
              role="alert"
              className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700"
            >
              {error}
            </div>
          )}
          <div>
            <label
              htmlFor="order-metadata"
              className="block text-sm font-medium text-dark-700 mb-1"
            >
              Metadata (JSON)
            </label>
            <textarea
              id="order-metadata"
              value={metadataJson}
              onChange={(e) => setMetadataJson(e.target.value)}
              rows={10}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg font-mono text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
              data-testid="order-edit-dialog_metadata-input"
            />
          </div>
        </div>
        <div className="px-6 py-4 border-t border-gray-200 flex items-center justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 text-dark-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-2 bg-primary-500 text-white rounded-lg hover:bg-primary-600 transition-colors disabled:opacity-50"
            data-testid="order-edit-dialog_save-btn"
          >
            {saving ? "Saving..." : "Save Metadata"}
          </button>
        </div>
      </div>
    </div>
  );
}
