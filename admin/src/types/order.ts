export interface IOrder {
  id: string;
  created: number;
  customerEmail: string | null;
  customerName: string | null;
  customerPhone: string | null;
  amountTotal: number;
  amountSubtotal: number;
  currency: string;
  status: "open" | "complete" | "expired";
  paymentStatus: "paid" | "unpaid" | "no_payment_required";
  mode: "payment" | "setup" | "subscription";
  metadata: Record<string, string>;
  url: string | null;
  orderStatus: string | null;
  description: string | null;
  shippingAddress: IShippingAddress | null;
}

export interface IShippingAddress {
  line1: string | null;
  line2: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
  country: string | null;
}

export interface IOrderUpdate {
  id: string;
  metadata?: Record<string, string>;
  collected_information?: {
    shipping_details?: {
      name?: string;
      address?: {
        line1?: string;
        line2?: string;
        city?: string;
        state?: string;
        postal_code?: string;
        country?: string;
      };
    };
  };
}

export interface IOrderLineItem {
  id: string;
  description: string;
  amountTotal: number;
  amountSubtotal: number;
  currency: string;
  quantity: number | null;
  productId: string | null;
  price: {
    id: string;
    unitAmount: number | null;
    currency: string;
  } | null;
}
