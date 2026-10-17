import "@testing-library/jest-dom/vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../src/api/client";
import type { Dashboard } from "../src/api/types";
import App from "../src/App";

const mocks = vi.hoisted(() => ({
  connectBank: vi.fn(),
  demoLogin: vi.fn(),
  getDashboard: vi.fn(),
  getDemoProfiles: vi.fn(),
  getSession: vi.fn(),
  logout: vi.fn(),
  syncBank: vi.fn(),
}));

vi.mock("../src/api/auth", () => ({
  demoLogin: mocks.demoLogin,
  getSession: mocks.getSession,
  logout: mocks.logout,
}));

vi.mock("../src/api/finance", () => ({
  connectBank: mocks.connectBank,
  getDashboard: mocks.getDashboard,
  getDemoProfiles: mocks.getDemoProfiles,
  syncBank: mocks.syncBank,
}));

vi.mock("recharts", () => ({
  Area: () => null,
  AreaChart: () => <div />,
  CartesianGrid: () => null,
  ResponsiveContainer: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  Tooltip: () => null,
  XAxis: () => null,
  YAxis: () => null,
}));

const dashboard: Dashboard = {
  connection: {
    profile_id: "steady-paycheck",
    nessie_customer_id: "customer-1",
    display_name: "Jordan Lee",
    data_source: "fixture",
    last_synced_at: "2026-10-17T12:00:00Z",
  },
  summary: {
    as_of: "2026-10-14",
    total_balance_cents: 967650,
    checking_balance_cents: 342650,
    savings_balance_cents: 625000,
    income_last_30_days_cents: 370000,
    spending_last_30_days_cents: 154750,
  },
  accounts: [
    {
      source_account_id: "checking-1",
      account_type: "checking",
      nickname: "Everyday Checking",
      balance_cents: 342650,
    },
  ],
  recent_transactions: [
    {
      source_account_id: "checking-1",
      source_id: "deposit-1",
      occurred_at: "2026-10-14",
      signed_amount_cents: 185000,
      direction: "inflow",
      kind: "deposit",
      merchant_name: null,
      category: "income",
      description: "Paycheck",
    },
  ],
  spending_by_category: [{ category: "groceries", amount_cents: 24000 }],
  forecast: null,
  active_goal: null,
};

function renderApp() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={["/dashboard"]}>
        <App />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

afterEach(cleanup);

describe("application API integration", () => {
  beforeEach(() => {
    cleanup();
    vi.resetAllMocks();
    mocks.getSession.mockResolvedValue({ id: "demo-player", display_name: "Demo Player" });
    mocks.getDashboard.mockResolvedValue(dashboard);
    mocks.getDemoProfiles.mockResolvedValue([]);
    mocks.connectBank.mockResolvedValue(dashboard.connection);
    mocks.syncBank.mockResolvedValue(dashboard.connection);
    mocks.demoLogin.mockResolvedValue({ id: "demo-player", display_name: "Demo Player" });
    mocks.logout.mockResolvedValue(undefined);
  });

  it("renders the backend dashboard response instead of placeholder finance data", async () => {
    renderApp();

    expect(await screen.findByRole("heading", { name: "Your money, at a glance." })).toBeInTheDocument();
    expect(screen.getByText("$9,677")).toBeInTheDocument();
    expect(screen.getByText("Everyday Checking")).toBeInTheDocument();
    expect(screen.getByText("Paycheck")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Town" })).toHaveAttribute("href", "/town");
    expect(screen.getByRole("link", { name: "Bank & goals" })).toHaveAttribute("href", "/dashboard");
  });

  it("shows demo login when there is no signed session", async () => {
    mocks.getSession.mockResolvedValue(null);
    renderApp();

    expect(await screen.findByRole("heading", { name: "Grow savings into something you can see." })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Enter the demo" })).toBeInTheDocument();
  });

  it("connects a selected profile when the dashboard reports no bank connection", async () => {
    const user = userEvent.setup();
    mocks.getDashboard
      .mockRejectedValueOnce(new ApiError(409, "Connect a demo bank before opening the dashboard"))
      .mockResolvedValue(dashboard);
    mocks.getDemoProfiles.mockResolvedValue([
      {
        id: "steady-paycheck",
        display_name: "Jordan Lee",
        description: "A predictable twice-monthly income.",
        income_pattern: "Steady paycheck",
      },
    ]);
    renderApp();

    expect(await screen.findByRole("heading", { name: "Choose a fictional financial story." })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Connect selected profile" }));

    expect(mocks.connectBank).toHaveBeenCalled();
    expect(mocks.connectBank.mock.calls[0][0]).toBe("steady-paycheck");
    expect(await screen.findByRole("heading", { name: "Your money, at a glance." })).toBeInTheDocument();
  });
});
