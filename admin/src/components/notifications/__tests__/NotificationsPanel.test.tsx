import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NotificationsPanel } from "../NotificationsPanel";
import type { IOrder } from "../../../types/order";

const mockOrders: IOrder[] = [
  {
    id: "cs_test_1",
    created: 3000000,
    orderStatus: "New",
    customerEmail: "alice@test.com",
    customerName: "Alice",
    amountTotal: 2500,
    currency: "usd",
    customerPhone: null,
    amountSubtotal: 2500,
    status: "open",
    paymentStatus: "unpaid",
    mode: "payment",
    metadata: {},
    url: null,
    description: null,
    shippingAddress: null,
  },
  {
    id: "cs_test_2",
    created: 2000000,
    orderStatus: "New",
    customerEmail: "bob@test.com",
    customerName: "Bob",
    amountTotal: 4000,
    currency: "usd",
    customerPhone: null,
    amountSubtotal: 4000,
    status: "open",
    paymentStatus: "unpaid",
    mode: "payment",
    metadata: {},
    url: null,
    description: null,
    shippingAddress: null,
  },
];

describe("NotificationsPanel", () => {
  it("renders when isOpen is true", () => {
    render(
      <NotificationsPanel
        isOpen={true}
        notifications={[]}
        onClose={() => {}}
        onSelect={() => {}}
      />,
    );

    expect(screen.getByTestId("notifications-panel")).toBeInTheDocument();
    expect(screen.getByTestId("notifications-panel_title")).toHaveTextContent(
      "Notifications",
    );
  });

  it("does not render when isOpen is false", () => {
    render(
      <NotificationsPanel
        isOpen={false}
        notifications={[]}
        onClose={() => {}}
        onSelect={() => {}}
      />,
    );

    expect(screen.queryByTestId("notifications-panel")).not.toBeInTheDocument();
  });

  it("shows empty state when there are no notifications", () => {
    render(
      <NotificationsPanel
        isOpen={true}
        notifications={[]}
        onClose={() => {}}
        onSelect={() => {}}
      />,
    );

    expect(screen.getByTestId("notifications-panel_empty")).toBeInTheDocument();
    expect(screen.getByText("No new notifications")).toBeInTheDocument();
  });

  it("renders notification list items", () => {
    render(
      <NotificationsPanel
        isOpen={true}
        notifications={mockOrders}
        onClose={() => {}}
        onSelect={() => {}}
      />,
    );

    const items = screen.getAllByTestId("notifications-panel_item");
    expect(items).toHaveLength(2);
    expect(screen.getByText("Alice")).toBeInTheDocument();
    expect(screen.getByText("Bob")).toBeInTheDocument();
  });

  it("calls onClose when close button is clicked", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();

    render(
      <NotificationsPanel
        isOpen={true}
        notifications={mockOrders}
        onClose={onClose}
        onSelect={() => {}}
      />,
    );

    const closeButton = screen.getByTestId("notifications-panel_close");
    await user.click(closeButton);

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("calls onClose when backdrop is clicked", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();

    render(
      <NotificationsPanel
        isOpen={true}
        notifications={mockOrders}
        onClose={onClose}
        onSelect={() => {}}
      />,
    );

    const backdrop = screen.getByTestId("notifications-panel_backdrop");
    await user.click(backdrop);

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("calls onSelect when a notification item is clicked", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();

    render(
      <NotificationsPanel
        isOpen={true}
        notifications={mockOrders}
        onClose={() => {}}
        onSelect={onSelect}
      />,
    );

    const items = screen.getAllByTestId("notifications-panel_item");
    await user.click(items[0]);

    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith(mockOrders[0]);
  });

  it("has correct accessibility attributes", () => {
    render(
      <NotificationsPanel
        isOpen={true}
        notifications={mockOrders}
        onClose={() => {}}
        onSelect={() => {}}
      />,
    );

    const panel = screen.getByTestId("notifications-panel");
    expect(panel).toHaveAttribute("role", "dialog");
    expect(panel).toHaveAttribute("aria-modal", "true");
    expect(panel).toHaveAttribute(
      "aria-labelledby",
      "notifications-panel_title",
    );
  });

  it("renders customer email when name is not available", () => {
    const ordersWithoutName: IOrder[] = [
      {
        ...mockOrders[0],
        customerName: null,
      },
    ];

    render(
      <NotificationsPanel
        isOpen={true}
        notifications={ordersWithoutName}
        onClose={() => {}}
        onSelect={() => {}}
      />,
    );

    expect(screen.getByText("alice@test.com")).toBeInTheDocument();
  });
});
