// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
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
import type { GameState, TownCatalog } from "../src/api/types";
import TownPage from "../src/features/town/TownPage";
import { BUILDING_DRAG_TYPE, buildingCatalog } from "../src/features/town/catalog/buildingCatalog";

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
    TownCanvas: ({ bridge, state }: { bridge: {
      emit: (event: string, detail: object) => void;
      subscribe: (event: string, listener: (detail: { catalogItemId: string; buildingId?: number }) => void) => () => void;
    }; state: GameState }) => {
      const [request, setRequest] = React.useState<{ catalogItemId: string; buildingId?: number } | null>(null);
      React.useEffect(() => {
        const stopStart = bridge.subscribe("startPlacement", (detail) => {
          setRequest(detail);
          bridge.emit("placementChanged", { active: true, valid: true, reason: null });
        });
        const stopCancel = bridge.subscribe("cancelPlacement", () => setRequest(null));
        return () => { stopStart(); stopCancel(); };
      }, [bridge]);
      return (
        <div data-testid="town-canvas">
          {state.buildings[0] && (
            <button type="button" onClick={() => bridge.emit("buildingSelected", {
              buildingId: state.buildings[0].id,
            })}>Select building</button>
          )}
          {request && (
            <button type="button" onClick={() => bridge.emit("placementConfirmed", {
              ...request,
              gridX: 4,
              gridY: 4,
            })}>Confirm placement</button>
          )}
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

function renderTown() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <TownPage />
    </QueryClientProvider>,
  );
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
  it("shows server-owned resources and keeps locked catalog items unavailable", async () => {
    renderTown();

    const sidebar = await screen.findByLabelText("Building catalog");
    expect(within(sidebar).getByText("300")).toBeInTheDocument();
    expect(within(sidebar).getByText("Homestead")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Corner Bakery locked until level 2" })).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: "Collapse town sidebar" }));
    expect(screen.getByRole("button", { name: "Open town sidebar" })).toHaveAttribute("aria-expanded", "false");
    expect(sidebar).not.toHaveClass("open");
vi.mock("../src/features/town/TownCanvas", () => ({
  TownCanvas: () => <div data-testid="town-canvas" />,
}));

afterEach(cleanup);

describe("town layout", () => {
  const renderTown = () => render(<MemoryRouter><TownPage /></MemoryRouter>);

  it("keeps town information in a permanent sidebar beside the map", () => {
    renderTown();

    expect(screen.getByTestId("town-canvas")).toBeInTheDocument();

    const sidebar = screen.getByLabelText("Building catalog");
    expect(within(sidebar).getByText("Buildings")).toBeInTheDocument();
    expect(within(sidebar).getByText("Coins")).toBeInTheDocument();
    expect(within(sidebar).getByText("Preview mode")).toBeInTheDocument();
    expect(within(sidebar).getByRole("link", { name: "Open bank and goals" })).toHaveAttribute(
      "href",
      "/dashboard",
    );
    expect(screen.queryByRole("button", { name: /town sidebar/i })).not.toBeInTheDocument();
  });

  it("makes catalog buildings available to drag onto the map", () => {
    const setData = vi.fn();
    renderTown();

    const bakery = screen.getByLabelText("Mossy bakery building");
    expect(bakery).toHaveAttribute("draggable", "true");

    fireEvent.dragStart(bakery, {
      dataTransfer: { effectAllowed: "none", setData },
    });

    expect(setData).toHaveBeenCalledWith(BUILDING_DRAG_TYPE, "mossy-bakery");
    expect(setData).toHaveBeenCalledWith("text/plain", "mossy-bakery");
  });

  it("uses readable, data-driven map sizes for each building", () => {
    const bakery = buildingCatalog.find((building) => building.id === "mossy-bakery");
    const townhouse = buildingCatalog.find((building) => building.id === "townhouse");
    const well = buildingCatalog.find((building) => building.id === "village-well");

    expect(bakery?.worldWidth).toBeGreaterThan(townhouse?.worldWidth ?? 0);
    expect(townhouse?.worldWidth).toBeGreaterThan(well?.worldWidth ?? 0);
    expect(well?.worldWidth).toBeGreaterThan(96);
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
    fireEvent.click(await screen.findByRole("button", { name: "Confirm placement" }));

    await waitFor(() => expect(vi.mocked(buyBuilding).mock.calls[0]?.[0]).toEqual({
        catalog_item_id: "woodshed_01",
        grid_x: 4,
        grid_y: 4,
      }));
    expect(await screen.findByText("200")).toBeInTheDocument();
  });

  it("cancels placement without charging and preserves state on server rejection", async () => {
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
  });

  it("explains level-up rewards and their newly unlocked catalog", async () => {
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
    vi.mocked(simulateWeek).mockResolvedValue({
      source: "fixture_fallback",
      replayed: false,
      evaluation: {
        id: 1,
        savings_ratio_basis_points: 10_000,
        adherence_tier: "within",
        explanation: "Saved the full weekly target.",
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
        created_at: "2026-10-17T12:00:00Z",
      },
      unlocks: {
        catalog_items: [catalog.items[1]],
        district: villageState.district,
        infrastructure: villageState.infrastructure,
      },
      game_state: villageState,
    });
    renderTown();

    fireEvent.click(await screen.findByRole("button", { name: "Simulate success" }));

    expect(await screen.findByRole("dialog")).toHaveTextContent("Welcome to Village");
    expect(screen.getByRole("dialog")).toHaveTextContent("+420 Coins");
    expect(screen.getByRole("dialog")).toHaveTextContent("Unlocked: Corner Bakery");
    expect(screen.getByRole("dialog")).toHaveTextContent("Fixture fallback");
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
    fireEvent.click(screen.getByRole("button", { name: "Move free" }));
    fireEvent.click(await screen.findByRole("button", { name: "Confirm placement" }));
    await waitFor(() => expect(moveBuilding).toHaveBeenCalledWith(7, { grid_x: 4, grid_y: 4 }));

    fireEvent.click(await screen.findByRole("button", { name: "Select building" }));
    fireEvent.click(screen.getByRole("button", { name: "Sell" }));
    await waitFor(() => expect(vi.mocked(sellBuilding).mock.calls[0]?.[0]).toBe(7));
    expect(await screen.findByText("260")).toBeInTheDocument();
  });
});
