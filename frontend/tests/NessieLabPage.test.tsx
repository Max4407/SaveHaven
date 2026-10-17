import "@testing-library/jest-dom/vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Dashboard } from "../src/api/types";
import NessieLabPage from "../src/features/nessie_lab/NessieLabPage";

const mocks = vi.hoisted(() => ({
  getDashboard: vi.fn(),
  getHealth: vi.fn(),
  runNessieEvent: vi.fn(),
}));

vi.mock("../src/api/finance", () => mocks);

const dashboard = {
  connection: { data_source: "live" },
  summary: { checking_balance_cents: 100_000 },
  accounts: [
    {
      source_account_id: "checking-1",
      account_type: "checking",
      nickname: "Checking",
      balance_cents: 100_000,
    },
  ],
  recent_transactions: [],
} as unknown as Dashboard;

function renderPage(queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })) {
  render(
    <QueryClientProvider client={queryClient}>
      <NessieLabPage />
    </QueryClientProvider>,
  );
  return queryClient;
}

afterEach(cleanup);

describe("Nessie Lab", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.getDashboard.mockResolvedValue(dashboard);
    mocks.getHealth.mockResolvedValue({
      status: "ok",
      data_mode: "live",
      nessie_configured: true,
      demo_controls_enabled: true,
    });
  });

  it("explains when mutation controls are disabled", async () => {
    mocks.getHealth.mockResolvedValue({
      status: "ok",
      data_mode: "live",
      nessie_configured: true,
      demo_controls_enabled: false,
    });
    renderPage();

    expect(await screen.findByText(/Nessie Lab is disabled/)).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Run sandbox event" })[0]).toBeDisabled();
  });

  it("shows a successful write and refreshes the cached dashboard", async () => {
    const user = userEvent.setup();
    const refreshed = {
      ...dashboard,
      summary: { checking_balance_cents: 285_000 },
      accounts: [{ ...dashboard.accounts[0], balance_cents: 285_000 }],
      recent_transactions: [
        {
          source_account_id: "checking-1",
          source_id: "deposit-1",
          occurred_at: "2026-10-17",
          signed_amount_cents: 185_000,
          direction: "inflow",
          kind: "deposit",
          merchant_name: "Northstar Studio",
          category: "income",
          description: "Demo paycheck",
        },
      ],
    } as Dashboard;
    mocks.runNessieEvent.mockResolvedValue({
      event_type: "paycheck",
      idempotency_key: "event-demo-001",
      created_records: ["paycheck deposit"],
      reused_records: [],
      dashboard: refreshed,
    });
    const queryClient = renderPage();

    await screen.findByText("Live Nessie Sandbox");
    await user.click(screen.getAllByRole("button", { name: "Run sandbox event" })[0]);

    expect(await screen.findByText("Synced. Created 1; reused 0.")).toBeInTheDocument();
    expect(screen.getByText("$2,850.00")).toBeInTheDocument();
    expect(screen.getByText(/Imported Northstar Studio/)).toBeInTheDocument();
    expect(queryClient.getQueryData(["dashboard"])).toEqual(refreshed);
  });
});
