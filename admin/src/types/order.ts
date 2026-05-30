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
}

export interface IOrderLineItem {
  id: string;
  description: string;
  amountTotal: number;
  amountSubtotal: number;
  currency: string;
  quantity: number | null;
  price: {
    id: string;
    unitAmount: number | null;
    currency: string;
  } | null;
}
