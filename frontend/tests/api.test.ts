import { afterEach, describe, expect, it, vi } from "vitest";
import { demoLogin, getSession, logout } from "../src/api/auth";
import { ApiError } from "../src/api/client";
import {
  acceptGoalPlan,
  connectBank,
  createGoal,
  getDashboard,
  getDemoProfiles,
  getHealth,
  regenerateGoalPlan,
  runNessieEvent,
  syncBank,
} from "../src/api/finance";

afterEach(() => vi.unstubAllGlobals());

describe("backend endpoint contracts", () => {
  it("calls every implemented endpoint with credentialed requests", async () => {
    const fetchMock = vi.fn().mockImplementation((input: string | URL | Request) => {
      const path = String(input);
      if (path === "/api/auth/logout") return Promise.resolve(new Response(null, { status: 204 }));
      if (path === "/api/demo/nessie-profiles") return Promise.resolve(Response.json([]));
      if (path === "/health") {
        return Promise.resolve(Response.json({ status: "ok", data_mode: "fixture", nessie_configured: false }));
      }
      return Promise.resolve(Response.json({
        id: "demo-player",
        display_name: "Demo Player",
        profile_id: "steady-paycheck",
        connection: {},
      }));
    });
    vi.stubGlobal("fetch", fetchMock);

    await getHealth();
    await demoLogin();
    await getSession();
    await logout();
    await getDemoProfiles();
    await connectBank("steady-paycheck");
    await syncBank();
    await getDashboard();
    await createGoal({
      name: "Emergency fund",
      target_amount_cents: 300000,
      amount_already_saved_cents: 0,
      target_date: "2027-10-17",
    });
    await regenerateGoalPlan(12);
    await acceptGoalPlan(12);
    await runNessieEvent({
      event_type: "paycheck",
      amount_cents: 185000,
      idempotency_key: "event-demo-001",
    });

    expect(fetchMock.mock.calls.map(([path]) => path)).toEqual([
      "/health",
      "/api/auth/demo-login",
      "/api/auth/session",
      "/api/auth/logout",
      "/api/demo/nessie-profiles",
      "/api/bank-connections",
      "/api/bank-connections/sync",
      "/api/dashboard",
      "/api/goals",
      "/api/goals/12/plan",
      "/api/goals/12/accept-plan",
      "/api/demo/nessie-events",
    ]);
    expect(fetchMock.mock.calls.every(([, init]) => init.credentials === "include")).toBe(true);
    expect(fetchMock.mock.calls[1][1]).toMatchObject({ method: "POST" });
    expect(fetchMock.mock.calls[5][1]).toMatchObject({
      method: "POST",
      body: JSON.stringify({ profile_id: "steady-paycheck" }),
    });
    expect(fetchMock.mock.calls[8][1]).toMatchObject({
      method: "POST",
      body: JSON.stringify({
        name: "Emergency fund",
        target_amount_cents: 300000,
        amount_already_saved_cents: 0,
        target_date: "2027-10-17",
      }),
    });
    expect(fetchMock.mock.calls[11][1]).toMatchObject({
      method: "POST",
      body: JSON.stringify({
        event_type: "paycheck",
        amount_cents: 185000,
        idempotency_key: "event-demo-001",
      }),
    });
  });

  it("maps backend detail responses to actionable API errors", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      Response.json({ detail: "Connect a demo bank before opening the dashboard" }, { status: 409 }),
    ));

    await expect(getDashboard()).rejects.toEqual(
      new ApiError(409, "Connect a demo bank before opening the dashboard"),
    );
  });
});
