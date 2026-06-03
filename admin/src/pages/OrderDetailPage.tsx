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
import type { IOrder, IOrderUpdate } from "../types";
import { ORDER_STATUS_CHANGED_EVENT } from "../utils/constants";
import {
  orderStatusBadge,
  orderStatusLabel,
  orderPaymentStatusBadge,
  orderPaymentStatusLabel,
  orderModeBadge,
  orderModeLabel,
  formatPrice,
  formatDate,
  truncateOrderId,
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
              {truncateOrderId(order.id)}
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
              <p
                data-testid="order-detail-page_no-line-items"
                className="text-dark-500"
              >
                No line items available
              </p>
            ) : (
              <div
                data-testid="order-detail-page_line-items-container"
                className="overflow-x-auto"
              >
                <table
                  data-testid="order-detail-page_line-items-table"
                  className="w-full"
                >
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr
                      data-testid="order-detail-page_line-items-table-header"
                      className="text-left text-xs font-medium text-dark-500 uppercase tracking-wider"
                    >
                      <th
                        data-testid="order-detail-page_line-items-table-header-item"
                        className="px-4 py-3 text-left text-xs font-medium text-dark-500 uppercase tracking-wider"
                      >
                        Item
                      </th>
                      <th
                        data-testid="order-detail-page_line-items-table-header-qty"
                        className="px-4 py-3 text-right text-xs font-medium text-dark-500 uppercase tracking-wider"
                      >
                        Qty
                      </th>
                      <th
                        data-testid="order-detail-page_line-items-table-header-subtotal"
                        className="px-4 py-3 text-right text-xs font-medium text-dark-500 uppercase tracking-wider"
                      >
                        Subtotal
                      </th>
                      <th
                        data-testid="order-detail-page_line-items-table-header-total"
                        className="px-4 py-3 text-right text-xs font-medium text-dark-500 uppercase tracking-wider"
                      >
                        Total
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {lineItems.map((item) => (
                      <tr
                        key={item.id}
                        className="hover:bg-gray-50 transition-colors"
                        data-testid="order-detail-page_line-items-table-row"
                      >
                        <td
                          data-testid="order-detail-page_line-items-table-cell-item"
                          className="px-4 py-3"
                        >
                          {item.productId ? (
                            <Link
                              to={`/products/${item.productId}`}
                              className="text-primary-600 hover:text-primary-800 hover:underline"
                              data-testid="order-detail-page_line-items-table-cell-item-description"
                            >
                              {item.description}
                            </Link>
                          ) : (
                            <div
                              className="text-dark-900"
                              data-testid="order-detail-page_line-items-table-cell-item-description"
                            >
                              {item.description}
                            </div>
                          )}
                          {item.price && (
                            <div
                              className="text-xs text-dark-500 font-mono mt-0.5"
                              data-testid="order-detail-page_line-items-table-cell-item-price-id"
                            >
                              {item.price.id}
                            </div>
                          )}
                        </td>
                        <td
                          data-testid="order-detail-page_line-items-table-cell-qty"
                          className="px-4 py-3 text-right text-dark-700"
                        >
                          {item.quantity || 1}
                        </td>
                        <td
                          data-testid="order-detail-page_line-items-table-cell-subtotal"
                          className="px-4 py-3 text-right text-dark-700"
                        >
                          {formatPrice(item.amountSubtotal)}
                        </td>
                        <td
                          data-testid="order-detail-page_line-items-table-cell-total"
                          className="px-4 py-3 text-right text-dark-900 font-medium"
                        >
                          {formatPrice(item.amountTotal)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-gray-50 border-t-2 border-gray-200">
                    <tr
                      data-testid="order-detail-page_line-items-table-footer-subtotal"
                      className="text-right"
                    >
                      <td
                        colSpan={3}
                        className="px-4 py-3 text-right text-sm font-medium text-dark-600"
                        data-testid="order-detail-page_line-items-table-footer-subtotal-label"
                      >
                        Subtotal
                      </td>
                      <td
                        className="px-4 py-3 text-right text-dark-900 font-medium"
                        data-testid="order-detail-page_line-items-table-footer-subtotal-value"
                      >
                        {formatPrice(order.amountSubtotal)}
                      </td>
                    </tr>
                    <tr
                      data-testid="order-detail-page_line-items-table-footer-total"
                      className="text-right"
                    >
                      <td
                        colSpan={3}
                        className="px-4 py-3 text-right text-sm font-medium text-dark-600"
                        data-testid="order-detail-page_line-items-table-footer-total-label"
                      >
                        Total
                      </td>
                      <td
                        className="px-4 py-3 text-right text-dark-900 font-bold text-lg"
                        data-testid="order-detail-page_line-items-table-footer-total-value"
                      >
                        {formatPrice(order.amountTotal)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>

          {/* Description */}
          {order.description && (
            <div
              data-testid="order-detail-page_description"
              className="bg-white rounded-xl p-6 shadow-sm border border-gray-200"
            >
              <h3
                data-testid="order-detail-page_description_header"
                className="font-heading text-xl font-semibold mb-4"
              >
                Description
              </h3>
              <p className="text-dark-700 whitespace-pre-wrap">
                {order.description}
              </p>
            </div>
          )}

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
              {order.orderStatus && (
                <div className="flex items-center justify-between">
                  <span className="text-dark-600">Order Status</span>
                  <span className="px-2 py-1 text-xs font-medium rounded-full bg-blue-100 text-blue-700">
                    {order.orderStatus.charAt(0).toUpperCase() +
                      order.orderStatus.slice(1)}
                  </span>
                </div>
              )}
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
              {order.shippingAddress && (
                <div className="pt-2 border-t border-gray-100">
                  <span className="text-sm text-dark-500 block mb-1">
                    Shipping Address
                  </span>
                  <p className="text-dark-700 text-sm">
                    {order.shippingAddress.line1}
                    {order.shippingAddress.line2 && (
                      <>, {order.shippingAddress.line2}</>
                    )}
                    <br />
                    {[
                      order.shippingAddress.city,
                      order.shippingAddress.state,
                      order.shippingAddress.postalCode,
                    ]
                      .filter(Boolean)
                      .join(", ")}
                    {order.shippingAddress.country &&
                      `, ${order.shippingAddress.country}`}
                  </p>
                </div>
              )}
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
                <p className="text-dark-700 font-mono text-xs" title={order.id}>
                  {truncateOrderId(order.id)}
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

const ORDER_STATUS_OPTIONS = [
  { label: "New", value: "new" },
  { label: "Pending", value: "pending" },
  { label: "Fulfilled", value: "fulfilled" },
];

function OrderEditDialog({
  order,
  onClose,
}: {
  order: IOrder;
  onClose: () => void;
}) {
  const dispatch = useDispatch<AppDispatch>();
  const [orderStatus, setOrderStatus] = useState(order.orderStatus || "new");
  const [description, setDescription] = useState(order.description || "");
  const [customerName, setCustomerName] = useState(order.customerName || "");
  const [addressLine1, setAddressLine1] = useState(
    order.shippingAddress?.line1 || "",
  );
  const [addressLine2, setAddressLine2] = useState(
    order.shippingAddress?.line2 || "",
  );
  const [addressCity, setAddressCity] = useState(
    order.shippingAddress?.city || "",
  );
  const [addressState, setAddressState] = useState(
    order.shippingAddress?.state || "",
  );
  const [addressPostalCode, setAddressPostalCode] = useState(
    order.shippingAddress?.postalCode || "",
  );
  const [addressCountry, setAddressCountry] = useState(
    order.shippingAddress?.country || "",
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async () => {
    try {
      setSaving(true);
      setError(null);

      const metadata: Record<string, string> = {
        ...order.metadata,
        order_status: orderStatus,
        description,
        customer_name: customerName,
      };

      if (addressLine1) metadata.address_line1 = addressLine1;
      if (addressLine2) metadata.address_line2 = addressLine2;
      if (addressCity) metadata.address_city = addressCity;
      if (addressState) metadata.address_state = addressState;
      if (addressPostalCode) metadata.address_postal_code = addressPostalCode;
      if (addressCountry) metadata.address_country = addressCountry;

      const hasCompleteAddress = !!(addressLine1 && addressCountry);

      const payload: IOrderUpdate = {
        id: order.id,
        metadata,
      };

      if (hasCompleteAddress) {
        payload.collected_information = {
          shipping_details: {
            name: customerName || order.customerName || "",
            address: {
              line1: addressLine1,
              ...(addressLine2 ? { line2: addressLine2 } : {}),
              ...(addressCity ? { city: addressCity } : {}),
              ...(addressState ? { state: addressState } : {}),
              ...(addressPostalCode ? { postal_code: addressPostalCode } : {}),
              country: addressCountry,
            },
          },
        };
      }

      await dispatch(updateOrder(payload)).unwrap();
      window.dispatchEvent(new CustomEvent(ORDER_STATUS_CHANGED_EVENT));
      onClose();
    } catch {
      setError("Failed to update order");
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
      <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
          <h3
            id="order-edit-title"
            className="font-heading text-xl font-semibold text-dark-900"
          >
            Edit Order
          </h3>
          <button
            onClick={onClose}
            aria-label="Close"
            className="p-1 hover:bg-gray-100 rounded"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
        </div>
        <div className="px-6 py-4 space-y-6">
          <p className="text-sm text-dark-500">
            Update details for order{" "}
            <span className="font-mono">{truncateOrderId(order.id)}</span>
          </p>
          {error && (
            <div
              role="alert"
              className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700"
            >
              {error}
            </div>
          )}

          {/* Order Status */}
          <div>
            <label
              htmlFor="order-status"
              className="block text-sm font-medium text-dark-700 mb-1"
            >
              Order Status
            </label>
            <select
              id="order-status"
              value={orderStatus}
              onChange={(e) => setOrderStatus(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
              data-testid="order-edit-dialog_status-select"
            >
              {ORDER_STATUS_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          {/* Description */}
          <div>
            <label
              htmlFor="order-description"
              className="block text-sm font-medium text-dark-700 mb-1"
            >
              Description
            </label>
            <textarea
              id="order-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
              data-testid="order-edit-dialog_description-input"
            />
          </div>

          {/* Customer Name */}
          <div>
            <label
              htmlFor="order-customer-name"
              className="block text-sm font-medium text-dark-700 mb-1"
            >
              Customer Name
            </label>
            <input
              id="order-customer-name"
              type="text"
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
              data-testid="order-edit-dialog_customer-name-input"
            />
          </div>

          {/* Shipping Address */}
          <fieldset>
            <legend className="text-sm font-medium text-dark-700 mb-2">
              Shipping Address
            </legend>
            <div className="grid grid-cols-1 gap-3">
              <div>
                <label
                  htmlFor="order-address-line1"
                  className="block text-xs text-dark-500 mb-0.5"
                >
                  Address Line 1
                </label>
                <input
                  id="order-address-line1"
                  type="text"
                  value={addressLine1}
                  onChange={(e) => setAddressLine1(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                  data-testid="order-edit-dialog_address-line1-input"
                />
              </div>
              <div>
                <label
                  htmlFor="order-address-line2"
                  className="block text-xs text-dark-500 mb-0.5"
                >
                  Address Line 2
                </label>
                <input
                  id="order-address-line2"
                  type="text"
                  value={addressLine2}
                  onChange={(e) => setAddressLine2(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                  data-testid="order-edit-dialog_address-line2-input"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label
                    htmlFor="order-address-city"
                    className="block text-xs text-dark-500 mb-0.5"
                  >
                    City
                  </label>
                  <input
                    id="order-address-city"
                    type="text"
                    value={addressCity}
                    onChange={(e) => setAddressCity(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                    data-testid="order-edit-dialog_address-city-input"
                  />
                </div>
                <div>
                  <label
                    htmlFor="order-address-state"
                    className="block text-xs text-dark-500 mb-0.5"
                  >
                    State
                  </label>
                  <input
                    id="order-address-state"
                    type="text"
                    value={addressState}
                    onChange={(e) => setAddressState(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                    data-testid="order-edit-dialog_address-state-input"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label
                    htmlFor="order-address-postal-code"
                    className="block text-xs text-dark-500 mb-0.5"
                  >
                    Postal Code
                  </label>
                  <input
                    id="order-address-postal-code"
                    type="text"
                    value={addressPostalCode}
                    onChange={(e) => setAddressPostalCode(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                    data-testid="order-edit-dialog_address-postal-code-input"
                  />
                </div>
                <div>
                  <label
                    htmlFor="order-address-country"
                    className="block text-xs text-dark-500 mb-0.5"
                  >
                    Country
                  </label>
                  <input
                    id="order-address-country"
                    type="text"
                    value={addressCountry}
                    onChange={(e) => setAddressCountry(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                    data-testid="order-edit-dialog_address-country-input"
                  />
                </div>
              </div>
            </div>
          </fieldset>
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
            {saving ? "Saving..." : "Save Changes"}
          </button>
        </div>
      </div>
    </div>
  );
}
