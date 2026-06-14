import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { AdminNavbar } from "../AdminNavbar";
import { ThemeProvider } from "../../../hooks/useTheme";

const mockGetSettings = vi.fn();
const mockGetOrders = vi.fn();
const mockNavigate = vi.fn();

vi.mock("../../../utils/api", () => ({
  api: {
    getSettings: (...args: unknown[]) => mockGetSettings(...args),
    getOrders: (...args: unknown[]) => mockGetOrders(...args),
  },
}));

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

function renderWithRouter(ui: React.ReactElement) {
  return render(
    <MemoryRouter>
      <ThemeProvider>{ui}</ThemeProvider>
    </MemoryRouter>,
  );
}

describe("AdminNavbar", () => {
  beforeEach(() => {
    mockGetOrders.mockResolvedValue({
      orders: [],
      hasMore: false,
      lastId: null,
      totalCount: 0,
    });
  });

  it("renders fallback title while loading, then business name from API", async () => {
    mockGetSettings.mockResolvedValue({ businessName: "Test Apiary" });
    renderWithRouter(<AdminNavbar />);

    expect(screen.getAllByText("Admin").length).toBeGreaterThanOrEqual(1);

    await waitFor(() => {
      const titles = screen.getAllByText("Test Apiary Admin");
      expect(titles.length).toBe(2);
    });
    expect(mockGetSettings).toHaveBeenCalledWith("site");
  });

  it("renders notification bell button", () => {
    renderWithRouter(<AdminNavbar />);
    expect(
      screen.getByTestId("admin-navbar_notifications"),
    ).toBeInTheDocument();
  });

  it("calls onMenuClick when menu button is clicked", async () => {
    const user = userEvent.setup();
    const onMenuClick = vi.fn();
    renderWithRouter(<AdminNavbar onMenuClick={onMenuClick} />);
    const menuButton = screen.getByLabelText("Toggle navigation menu");
    await user.click(menuButton);
    expect(onMenuClick).toHaveBeenCalledTimes(1);
  });

  it("opens notifications panel when bell is clicked", async () => {
    const user = userEvent.setup();
    renderWithRouter(<AdminNavbar />);

    expect(screen.queryByTestId("notifications-panel")).not.toBeInTheDocument();

    const bellButton = screen.getByTestId("admin-navbar_notifications");
    await user.click(bellButton);

    expect(screen.getByTestId("notifications-panel")).toBeInTheDocument();
  });

  it("shows notification badge when there are new orders", async () => {
    mockGetOrders.mockResolvedValue({
      orders: [
        {
          id: "cs_test_1",
          created: 1000000,
          orderStatus: "New",
          customerEmail: "test@test.com",
          amountTotal: 2000,
          currency: "usd",
          customerName: null,
          customerPhone: null,
          amountSubtotal: 2000,
          status: "open",
          paymentStatus: "unpaid",
          mode: "payment",
          metadata: {},
          url: null,
          description: null,
          shippingAddress: null,
        },
      ],
      hasMore: false,
      lastId: "cs_test_1",
      totalCount: 1,
    });

    renderWithRouter(<AdminNavbar />);

    await waitFor(() => {
      expect(
        screen.getByTestId("admin-navbar_notification-badge"),
      ).toBeInTheDocument();
    });
  });

  it("hides notification badge when there are no new orders", async () => {
    renderWithRouter(<AdminNavbar />);

    await waitFor(() => {
      expect(
        screen.queryByTestId("admin-navbar_notification-badge"),
      ).not.toBeInTheDocument();
    });
  });

  it("closes notifications panel when close button is clicked", async () => {
    const user = userEvent.setup();
    renderWithRouter(<AdminNavbar />);

    const bellButton = screen.getByTestId("admin-navbar_notifications");
    await user.click(bellButton);
    expect(screen.getByTestId("notifications-panel")).toBeInTheDocument();

    const closeButton = screen.getByTestId("notifications-panel_close");
    await user.click(closeButton);

    await waitFor(() => {
      expect(
        screen.queryByTestId("notifications-panel"),
      ).not.toBeInTheDocument();
    });
  });

  it("navigates to order detail when notification is selected", async () => {
    mockGetOrders.mockResolvedValue({
      orders: [
        {
          id: "cs_test_1",
          created: 2000000,
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
      ],
      hasMore: false,
      lastId: "cs_test_1",
      totalCount: 1,
    });

    const user = userEvent.setup();
    renderWithRouter(<AdminNavbar />);

    const bellButton = screen.getByTestId("admin-navbar_notifications");
    await user.click(bellButton);

    await waitFor(() => {
      expect(
        screen.getByTestId("notifications-panel_item"),
      ).toBeInTheDocument();
    });

    const item = screen.getByTestId("notifications-panel_item");
    await user.click(item);

    expect(mockNavigate).toHaveBeenCalledWith("/orders/cs_test_1");
  });
});
