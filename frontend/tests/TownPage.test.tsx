// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../src/api/client";
import { getHealth } from "../src/api/finance";
import {
  buyBuilding,
  getGameRewards,
  getGameState,
  getTownCatalog,
  moveBuilding,
  resetDemo,
  sellBuilding,
  simulateWeek,
} from "../src/api/game";
import type { GameState, SimulatedWeek, TownCatalog } from "../src/api/types";
import TownPage from "../src/features/town/TownPage";
import type { TownBridge } from "../src/features/town/townBridge";

const placementSound = vi.hoisted(() => vi.fn());
vi.mock("../src/features/town/usePlacementSound", () => ({ usePlacementSound: () => placementSound }));

const canvasBridge = vi.hoisted(() => ({ current: null as TownBridge | null }));

vi.mock("../src/features/town/TownMusic", () => ({ TownMusic: () => null }));

vi.mock("../src/api/finance", () => ({ getHealth: vi.fn() }));
vi.mock("../src/api/game", () => ({
  buyBuilding: vi.fn(),
  getGameRewards: vi.fn(),
  getGameState: vi.fn(),
  getTownCatalog: vi.fn(),
  moveBuilding: vi.fn(),
  resetDemo: vi.fn(),
  sellBuilding: vi.fn(),
  simulateWeek: vi.fn(),
}));
vi.mock("../src/features/town/TownCanvas", async () => {
  const React = await import("react");
  return {
    TownCanvas: ({ bridge, state }: { bridge: TownBridge; state: GameState }) => {
      canvasBridge.current = bridge;
      const [request, setRequest] = React.useState<{
        catalogItemId: string;
        buildingId?: number;
      } | null>(null);
      React.useEffect(() => {
        const beginPlacement = (detail: { catalogItemId: string; buildingId?: number }) => {
          setRequest(detail);
          bridge.emit("placementChanged", { active: true, valid: true, reason: null });
        };
        const stopStart = bridge.subscribe("startPlacement", beginPlacement);
        const stopCatalogDrag = bridge.subscribe("catalogDragStarted", beginPlacement);
        const stopCancel = bridge.subscribe("cancelPlacement", () => {
          setRequest(null);
          bridge.emit("placementChanged", { active: false, valid: false, reason: null });
        });
        return () => { stopStart(); stopCatalogDrag(); stopCancel(); };
      }, [bridge]);
      return (
        <div data-testid="town-canvas">
          {state.buildings[0] ? (
            <output data-testid="persisted-position">
              {state.buildings[0].grid_x},{state.buildings[0].grid_y}
            </output>
          ) : null}
          {state.buildings[0] ? (
            <button type="button" onClick={() => bridge.emit("buildingSelected", {
              buildingId: state.buildings[0].id,
            })}>Select building</button>
          ) : null}
          <button type="button" onClick={() => bridge.emit("buildingDeselected", {})}>
            Click empty map
          </button>
          {request ? (
            <button type="button" onClick={() => bridge.emit("placementConfirmed", {
              ...request,
              gridX: 4,
              gridY: 4,
            })}>Confirm placement</button>
          ) : null}
        </div>
      );
    },
  };
});

const catalog: TownCatalog = {
  items: [
    {
      id: "woodshed_01",
      name: "Village Woodshed",
      category: "yard",
      asset: "/woodshed.png",
      shadow_asset: "/woodshed-shadow.png",
      cost_coins: 100,
      level_required: 1,
      footprint: { width: 1, height: 1 },
      pivot: { x: 20, y: 20 },
      landmark: false,
    },
    {
      id: "bakery_01",
      name: "Corner Bakery",
      category: "trade",
      asset: "/bakery.png",
      shadow_asset: "/bakery-shadow.png",
      cost_coins: 400,
      level_required: 2,
      footprint: { width: 2, height: 2 },
      pivot: { x: 30, y: 50 },
      landmark: false,
    },
  ],
};

const initialState: GameState = {
  wallet: {
    coin_balance: 300,
    total_coins_earned: 300,
    xp: 0,
    level: 1,
    level_name: "Homestead",
    streak_weeks: 0,
  },
  progression: { current_level_xp: 0, next_level_xp: 100, progress_percent: 0 },
  district: { min_x: 4, max_x: 11, min_y: 4, max_y: 11 },
  infrastructure: { tier: "dirt", reserved_cells: [{ x: 7, y: 7 }] },
  buildings: [],
};

const simulatedWeek = (gameState: GameState): SimulatedWeek => ({
  source: "fixture_fallback",
  replayed: false,
  evaluation: {
    id: 1,
    period_start: "2026-10-12",
    period_end: "2026-10-18",
    planned_savings_cents: 10000,
    actual_net_savings_cents: 10000,
    planned_discretionary_spending_cents: 40000,
    actual_discretionary_spending_cents: 30000,
    savings_ratio_basis_points: 10_000,
    adherence_tier: "within",
    exceptional_expense_flag: false,
    source: "fixture",
    explanation: "Saved the full weekly target.",
    evaluated_at: "2026-10-18T12:00:00Z",
  },
  reward: {
    id: 1,
    plan_period_id: 1,
    reward_type: "weekly_plan",
    coins_awarded: 420,
    xp_awarded: 100,
    previous_level: 1,
    new_level: 2,
    streak_weeks: 1,
    explanation: "Saved 100% of the weekly target; within spending awarded 420 Coins and 100 XP.",
    created_at: "2026-10-18T12:00:00Z",
  },
  unlocks: {
    catalog_items: [catalog.items[1]],
    district: gameState.district,
    infrastructure: gameState.infrastructure,
  },
  game_state: gameState,
});

function renderTown() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const invalidateQueries = vi.spyOn(queryClient, "invalidateQueries");
  const rendered = render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <TownPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return { ...rendered, invalidateQueries };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getTownCatalog).mockResolvedValue(catalog);
  vi.mocked(getGameState).mockResolvedValue(initialState);
  vi.mocked(getGameRewards).mockResolvedValue({ rewards: [] });
  vi.mocked(getHealth).mockResolvedValue({
    status: "ok",
    data_mode: "fixture",
    nessie_configured: false,
    demo_controls_enabled: false,
  });
  vi.mocked(moveBuilding).mockResolvedValue(initialState);
  vi.mocked(sellBuilding).mockResolvedValue(initialState);
  vi.mocked(simulateWeek).mockRejectedValue(new Error("not used"));
  vi.mocked(resetDemo).mockResolvedValue({ game_state: initialState, cleanup_warnings: [] });
});

afterEach(cleanup);

describe("town economy", () => {
  it.each(["Sell", "Simulate success", "Reset town demo"])("blocks canvas changes during %s and releases the lock on failure", async (action) => {
    const placed: GameState = { ...initialState, buildings: [{
      id: 7, catalog_item_id: "woodshed_01", grid_x: 5, grid_y: 4,
      purchase_price_coins: 100, purchased_at: "2026-10-17T12:00:00Z", updated_at: "2026-10-17T12:00:00Z",
    }] };
    vi.mocked(getGameState).mockResolvedValue(placed);
    vi.mocked(getHealth).mockResolvedValue({ status: "ok", data_mode: "fixture", nessie_configured: false, demo_controls_enabled: true });
    let reject!: (error: Error) => void;
    const pending = () => new Promise<never>((_resolve, no) => { reject = no; });
    vi.mocked(sellBuilding).mockImplementation(pending);
    vi.mocked(simulateWeek).mockImplementation(pending);
    vi.mocked(resetDemo).mockImplementation(pending);
    renderTown();
    if (action === "Sell") fireEvent.click(await screen.findByRole("button", { name: "Select building" }));
    fireEvent.click(await screen.findByRole("button", { name: action }));
    await waitFor(() => expect(reject).toBeDefined());
    act(() => canvasBridge.current!.emit("placementConfirmed", {
      catalogItemId: "woodshed_01", buildingId: 7, gridX: 6, gridY: 4,
    }));
    expect(moveBuilding).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Reset town demo" })).toBeDisabled();
    await act(async () => reject(new Error("Network unavailable")));
    await waitFor(() => expect(screen.getByRole("button", { name: "Reset town demo" })).toBeEnabled());
    expect(screen.getByTestId("persisted-position")).toHaveTextContent("5,4");
    expect(screen.getByRole("alert")).toBeInTheDocument();
  });

  it.each(["resolve", "reject"])("blocks duplicate and competing actions until a slow purchase settles (%s)", async (outcome) => {
    let resolve!: (state: GameState) => void;
    let reject!: (error: Error) => void;
    vi.mocked(buyBuilding).mockImplementationOnce(() => new Promise((yes, no) => {
      resolve = yes;
      reject = no;
    }));
    renderTown();
    await screen.findByRole("button", { name: "Place Village Woodshed" });
    const bridge = canvasBridge.current!;
    const events: string[] = [];
    bridge.subscribe("stateChanged", () => events.push("state"));
    bridge.subscribe("interactionLocked", ({ locked }) => events.push(locked ? "lock" : "unlock"));
    act(() => {
      bridge.emit("placementConfirmed", { catalogItemId: "woodshed_01", gridX: 4, gridY: 4 });
      bridge.emit("placementConfirmed", { catalogItemId: "woodshed_01", gridX: 5, gridY: 4 });
      bridge.emit("placementConfirmed", { catalogItemId: "woodshed_01", buildingId: 7, gridX: 6, gridY: 4 });
    });
    await waitFor(() => expect(buyBuilding).toHaveBeenCalledTimes(1));
    expect(moveBuilding).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Place Village Woodshed" })).toBeDisabled();
    await act(async () => {
      if (outcome === "resolve") resolve({ ...initialState, wallet: { ...initialState.wallet, coin_balance: 200 } });
      else reject(new ApiError(409, "Placement rejected", "occupied"));
    });
    await waitFor(() => expect(screen.getByRole("button", { name: "Place Village Woodshed" })).toBeEnabled());
    expect(events).toEqual(["lock", "state", "unlock"]);
    if (outcome === "reject") expect(screen.getByRole("alert")).toHaveTextContent("Placement rejected");
    vi.mocked(buyBuilding).mockResolvedValue(initialState);
    act(() => bridge.emit("placementConfirmed", { catalogItemId: "woodshed_01", gridX: 4, gridY: 4 }));
    await waitFor(() => expect(buyBuilding).toHaveBeenCalledTimes(2));
  });

  it("shows server-owned resources and keeps locked catalog items unavailable", async () => {
    renderTown();

    const sidebar = await screen.findByLabelText("Building catalog");
    expect(within(sidebar).getByText("300")).toBeInTheDocument();
    expect(within(sidebar).getByText("Homestead")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Corner Bakery locked until level 2" })).toBeDisabled();
    expect(screen.getByText("Village Woodshed").closest("article")).toHaveAttribute("draggable", "true");
    expect(screen.getByText("Corner Bakery").closest("article")).toHaveAttribute("draggable", "false");
    expect(within(sidebar).getByRole("link", { name: "Open bank and goals" })).toHaveAttribute(
      "href",
      "/dashboard",
    );

    fireEvent.click(screen.getByRole("button", { name: "Collapse town sidebar" }));
    expect(screen.getByRole("button", { name: "Open town sidebar" })).toHaveAttribute(
      "aria-expanded",
      "false",
    );
    expect(sidebar).not.toHaveClass("open");
  });

  it("charges only after Phaser confirms a valid placement", async () => {
    const purchased: GameState = {
      ...initialState,
      wallet: { ...initialState.wallet, coin_balance: 200 },
      buildings: [{
        id: 1,
        catalog_item_id: "woodshed_01",
        grid_x: 4,
        grid_y: 4,
        purchase_price_coins: 100,
        purchased_at: "2026-10-17T12:00:00Z",
        updated_at: "2026-10-17T12:00:00Z",
      }],
    };
    vi.mocked(buyBuilding).mockResolvedValue(purchased);
    renderTown();

    fireEvent.click(await screen.findByRole("button", { name: "Place Village Woodshed" }));
    expect(buyBuilding).not.toHaveBeenCalled();
    expect(placementSound).not.toHaveBeenCalled();
    fireEvent.click(await screen.findByRole("button", { name: "Confirm placement" }));

    await waitFor(() => expect(buyBuilding).toHaveBeenCalledWith({
      catalog_item_id: "woodshed_01",
      grid_x: 4,
      grid_y: 4,
    }, expect.anything()));
    expect(await screen.findByText("200")).toBeInTheDocument();
    expect(placementSound).toHaveBeenCalledTimes(1);
  });

  it("starts catalog drag placement without charging before the snapped drop is confirmed", async () => {
    vi.mocked(buyBuilding).mockResolvedValue({
      ...initialState,
      wallet: { ...initialState.wallet, coin_balance: 200 },
    });
    renderTown();
    const card = (await screen.findByText("Village Woodshed")).closest("article");
    expect(card).not.toBeNull();
    const setData = vi.fn();
    const dataTransfer = {
      effectAllowed: "none",
      dropEffect: "none",
      setData,
      getData: vi.fn(),
    } as unknown as DataTransfer;

    fireEvent.dragStart(card!, { dataTransfer });

    expect(setData).toHaveBeenCalledWith(
      "application/x-savehaven-catalog-item",
      "woodshed_01",
    );
    expect(buyBuilding).not.toHaveBeenCalled();
    fireEvent.click(await screen.findByRole("button", { name: "Confirm placement" }));
    await waitFor(() => expect(buyBuilding).toHaveBeenCalledWith({
      catalog_item_id: "woodshed_01",
      grid_x: 4,
      grid_y: 4,
    }, expect.anything()));
  });

  it("cancels without charging and preserves confirmed state on server rejection", async () => {
    vi.mocked(buyBuilding).mockRejectedValue(
      new ApiError(409, "Another building already occupies that space.", "occupied"),
    );
    renderTown();

    fireEvent.click(await screen.findByRole("button", { name: "Place Village Woodshed" }));
    fireEvent.click(await screen.findByRole("button", { name: "Cancel" }));
    expect(buyBuilding).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Place Village Woodshed" }));
    fireEvent.click(await screen.findByRole("button", { name: "Confirm placement" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Another building already occupies");
    expect(screen.getByText("300")).toBeInTheDocument();
    expect(placementSound).not.toHaveBeenCalled();
  });

  it("explains level-up rewards and refreshes finance and reward state", async () => {
    const villageState: GameState = {
      ...initialState,
      wallet: {
        coin_balance: 720,
        total_coins_earned: 720,
        xp: 100,
        level: 2,
        level_name: "Village",
        streak_weeks: 1,
      },
      progression: { current_level_xp: 100, next_level_xp: 300, progress_percent: 0 },
      district: { min_x: 2, max_x: 13, min_y: 2, max_y: 13 },
      infrastructure: { tier: "gravel", reserved_cells: [{ x: 7, y: 7 }] },
    };
    vi.mocked(getHealth).mockResolvedValue({
      status: "ok",
      data_mode: "fixture",
      nessie_configured: false,
      demo_controls_enabled: true,
    });
    vi.mocked(simulateWeek).mockResolvedValue(simulatedWeek(villageState));
    const { invalidateQueries } = renderTown();

    fireEvent.click(await screen.findByRole("button", { name: "Simulate success" }));

    expect(await screen.findByRole("dialog")).toHaveTextContent("Welcome to Village");
    expect(screen.getByRole("dialog")).toHaveTextContent("+420 Coins");
    expect(screen.getByRole("dialog")).toHaveTextContent("Saved from bank activity$100.00");
    expect(screen.getByRole("dialog")).toHaveTextContent("Saved the full weekly target.");
    expect(screen.getByRole("dialog")).toHaveTextContent("Unlocked: Corner Bakery");
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ["game-rewards"] });
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ["dashboard"] });
  });

  it("moves for free and shows the original-price sale refund", async () => {
    const placedState: GameState = {
      ...initialState,
      wallet: { ...initialState.wallet, coin_balance: 200 },
      buildings: [{
        id: 7,
        catalog_item_id: "woodshed_01",
        grid_x: 5,
        grid_y: 4,
        purchase_price_coins: 100,
        purchased_at: "2026-10-17T12:00:00Z",
        updated_at: "2026-10-17T12:00:00Z",
      }],
    };
    vi.mocked(getGameState).mockResolvedValue(placedState);
    vi.mocked(moveBuilding).mockResolvedValue(placedState);
    vi.mocked(sellBuilding).mockResolvedValue({
      ...initialState,
      wallet: { ...initialState.wallet, coin_balance: 260 },
    });
    renderTown();

    fireEvent.click(await screen.findByRole("button", { name: "Select building" }));
    expect(screen.getByText("sells for 60", { exact: false })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Move" }));
    fireEvent.click(await screen.findByRole("button", { name: "Confirm placement" }));
    await waitFor(() => expect(moveBuilding).toHaveBeenCalledWith(7, { grid_x: 4, grid_y: 4 }));

    fireEvent.click(await screen.findByRole("button", { name: "Select building" }));
    fireEvent.click(screen.getByRole("button", { name: "Sell" }));
    await waitFor(() => expect(sellBuilding).toHaveBeenCalledWith(7, expect.anything()));
    expect(await screen.findByText("260")).toBeInTheDocument();
  });

  it("hides building actions after clicking empty map space", async () => {
    vi.mocked(getGameState).mockResolvedValue({
      ...initialState,
      buildings: [{
        id: 7,
        catalog_item_id: "woodshed_01",
        grid_x: 5,
        grid_y: 4,
        purchase_price_coins: 100,
        purchased_at: "2026-10-17T12:00:00Z",
        updated_at: "2026-10-17T12:00:00Z",
      }],
    });
    renderTown();

    fireEvent.click(await screen.findByRole("button", { name: "Select building" }));
    expect(screen.getByLabelText("Selected building")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Click empty map" }));

    expect(screen.queryByLabelText("Selected building")).not.toBeInTheDocument();
  });

  it("keeps the last server-confirmed position when an occupied move is rejected", async () => {
    const placedState: GameState = {
      ...initialState,
      buildings: [{
        id: 7,
        catalog_item_id: "woodshed_01",
        grid_x: 5,
        grid_y: 4,
        purchase_price_coins: 100,
        purchased_at: "2026-10-17T12:00:00Z",
        updated_at: "2026-10-17T12:00:00Z",
      }],
    };
    vi.mocked(getGameState).mockResolvedValue(placedState);
    vi.mocked(moveBuilding).mockRejectedValue(
      new ApiError(409, "Another building already occupies that space.", "occupied"),
    );
    renderTown();

    fireEvent.click(await screen.findByRole("button", { name: "Select building" }));
    fireEvent.click(screen.getByRole("button", { name: "Move" }));
    fireEvent.click(await screen.findByRole("button", { name: "Confirm placement" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Another building already occupies");
    expect(screen.getByTestId("persisted-position")).toHaveTextContent("5,4");
  });

  it("resets server state and refreshes dependent queries", async () => {
    vi.mocked(getHealth).mockResolvedValue({
      status: "ok",
      data_mode: "fixture",
      nessie_configured: false,
      demo_controls_enabled: true,
    });
    const { invalidateQueries } = renderTown();

    fireEvent.click(await screen.findByRole("button", { name: "Reset town demo" }));

    await waitFor(() => expect(resetDemo).toHaveBeenCalled());
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ["game-rewards"] });
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ["dashboard"] });
  });
});
