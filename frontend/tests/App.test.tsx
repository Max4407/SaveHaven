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
  acceptGoalPlan: vi.fn(),
  connectBank: vi.fn(),
  createGoal: vi.fn(),
  demoLogin: vi.fn(),
  getDashboard: vi.fn(),
  getDemoProfiles: vi.fn(),
  getHealth: vi.fn(),
  getSession: vi.fn(),
  logout: vi.fn(),
  regenerateGoalPlan: vi.fn(),
  runNessieEvent: vi.fn(),
  syncBank: vi.fn(),
}));

vi.mock("../src/api/auth", () => ({
  demoLogin: mocks.demoLogin,
  getSession: mocks.getSession,
  logout: mocks.logout,
}));

vi.mock("../src/api/finance", () => ({
  acceptGoalPlan: mocks.acceptGoalPlan,
  connectBank: mocks.connectBank,
  createGoal: mocks.createGoal,
  getDashboard: mocks.getDashboard,
  getDemoProfiles: mocks.getDemoProfiles,
  getHealth: mocks.getHealth,
  regenerateGoalPlan: mocks.regenerateGoalPlan,
  runNessieEvent: mocks.runNessieEvent,
  syncBank: mocks.syncBank,
}));

vi.mock("recharts", () => ({
  CartesianGrid: () => null,
  Line: ({ type }: { type: string }) => <div data-testid="balance-line" data-line-type={type} />,
  LineChart: ({ children }: { children: ReactNode }) => <div>{children}</div>,
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
  import_summary: {
    account_count: 1,
    transaction_count: 1,
    transaction_types: ["deposit"],
  },
  forecast: {
    weekly_income_cents: 92500,
    weekly_recurring_bills_cents: 0,
    weekly_variable_spending_cents: 0,
    safety_buffer_cents: 9250,
    income_cadence: "biweekly",
    confidence: "medium",
    detected_deposit_count: 2,
    evidence: ["Detected two deposits."],
  },
  active_goal: null,
  current_plan: null,
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
    mocks.getHealth.mockResolvedValue({ status: "ok", data_mode: "fixture", nessie_configured: false, demo_controls_enabled: false });
    mocks.connectBank.mockResolvedValue(dashboard.connection);
    mocks.syncBank.mockResolvedValue(dashboard.connection);
    mocks.demoLogin.mockResolvedValue({ id: "demo-player", display_name: "Demo Player" });
    mocks.logout.mockResolvedValue(undefined);
  });

  it("renders the backend dashboard response instead of placeholder finance data", async () => {
    renderApp();

    expect(await screen.findByRole("heading", { name: "Bank" })).toBeInTheDocument();
    expect(screen.getByText("$9,677")).toBeInTheDocument();
    expect(screen.getByText("$1,548")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Savings goals" })).toBeInTheDocument();
    expect(screen.getByText("No active goal")).toBeInTheDocument();
    expect(screen.getByText(/Create a savings goal below/)).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Money over time" })).toBeInTheDocument();
    expect(screen.getByTestId("balance-line")).toHaveAttribute("data-line-type", "linear");
    expect(screen.queryByText("Everyday Checking")).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Transactions" })).toBeInTheDocument();
    expect(screen.getByText("Paycheck")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Build your town/ })).toHaveAttribute("href", "/town");
    expect(screen.getAllByLabelText("Nessie import provenance")).toHaveLength(1);
    expect(screen.getByText(/Fixture fallback:/)).toBeInTheDocument();
  });

  it("keeps the transaction preview compact and lets users expand the imported history", async () => {
    const user = userEvent.setup();
    mocks.getDashboard.mockResolvedValue({
      ...dashboard,
      recent_transactions: Array.from({ length: 8 }, (_, index) => ({
        ...dashboard.recent_transactions[0],
        source_id: `transaction-${index}`,
        merchant_name: `Merchant ${index + 1}`,
      })),
    });
    renderApp();
    const viewAll = await screen.findByRole("button", { name: "View all (8)" });
    expect(screen.getByText("Merchant 5")).toBeInTheDocument();
    expect(screen.queryByText("Merchant 6")).not.toBeInTheDocument();
    expect(viewAll).toHaveAttribute("aria-expanded", "false");
    await user.click(viewAll);
    expect(screen.getByText("Merchant 8")).toBeInTheDocument();
    const showLess = screen.getByRole("button", { name: "Show less" });
    expect(showLess).toHaveAttribute("aria-expanded", "true");
    await user.click(showLess);
    expect(screen.queryByText("Merchant 6")).not.toBeInTheDocument();
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

    expect(await screen.findByRole("heading", { name: "Connect a fictional bank profile." })).toBeInTheDocument();
    expect(screen.getByLabelText("Fictional username")).toHaveAttribute("readonly");
    expect(screen.getByLabelText("Fictional password")).toHaveAttribute("readonly");
    await user.click(screen.getByRole("checkbox"));
    await user.click(screen.getByRole("button", { name: "Connect selected profile" }));

    expect(mocks.connectBank).toHaveBeenCalled();
    expect(mocks.connectBank.mock.calls[0][0]).toBe("steady-paycheck");
    expect(await screen.findByRole("heading", { name: "Bank" })).toBeInTheDocument();
  });

  it("submits a savings goal in integer cents for a data-driven recommendation", async () => {
    const user = userEvent.setup();
    mocks.createGoal.mockResolvedValue({ goal: {}, forecast: dashboard.forecast, plan: {} });
    renderApp();

    await screen.findByRole("heading", { name: "Savings plan" });
    await user.clear(screen.getByLabelText("Target amount"));
    await user.type(screen.getByLabelText("Target amount"), "4250");
    await user.clear(screen.getByLabelText("Already saved"));
    await user.type(screen.getByLabelText("Already saved"), "250");
    await user.click(screen.getByRole("button", { name: "Generate recommendation" }));

    expect(mocks.createGoal).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "Emergency fund",
        target_amount_cents: 425000,
        amount_already_saved_cents: 25000,
      }),
      expect.anything(),
    );
  });

  it("shows live provenance and an accepted plan without relabeling it as a draft", async () => {
    mocks.getDashboard.mockResolvedValue({
      ...dashboard,
      connection: { ...dashboard.connection, data_source: "live" },
      active_goal: {
        id: 7,
        name: "Emergency fund",
        target_amount_cents: 300000,
        amount_already_saved_cents: 50000,
        target_date: "2027-04-17",
      },
      current_plan: {
        goal_id: 7,
        weekly_income_cents: 92500,
        weekly_recurring_bills_cents: 31780,
        weekly_variable_spending_cents: 4320,
        safety_buffer_cents: 9250,
        weekly_savings_cents: 10000,
        safe_to_spend_cents: 41470,
        confidence: "medium",
        income_cadence: "biweekly",
        feasible: true,
        suggested_target_date: null,
        explanation: "Accepted recommendation.",
        evidence: ["Detected two biweekly deposits."],
        status: "accepted",
        accepted_at: "2026-10-17T12:00:00Z",
      },
    });
    renderApp();

    expect(await screen.findByText("Live Nessie Sandbox")).toBeInTheDocument();
    expect(screen.getByText("Accepted")).toBeInTheDocument();
    expect(screen.getByText("1 active goal")).toBeInTheDocument();
    expect(screen.getByRole("progressbar", { name: "Emergency fund progress" })).toHaveAttribute(
      "aria-valuenow",
      "17",
    );
    expect(screen.queryByText(/Fixture fallback:/)).not.toBeInTheDocument();
    expect(screen.getByText(/stay fixed/)).toBeInTheDocument();
  });
});
