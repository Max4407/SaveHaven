// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { GameState, TownCatalog } from "../src/api/types";
import { TownCanvas } from "../src/features/town/TownCanvas";
import {
  CATALOG_DRAG_TYPE,
  createTownBridge,
  type TownBridge,
} from "../src/features/town/townBridge";

const mocks = vi.hoisted(() => ({
  destroy: vi.fn(),
  gameConstructor: vi.fn(),
  sceneConstructor: vi.fn(),
}));

vi.mock("phaser", () => ({
  default: {
    AUTO: "AUTO",
    Scale: { RESIZE: "RESIZE" },
    Game: class {
      constructor(config: unknown) {
        mocks.gameConstructor(config);
      }

      destroy(removeCanvas: boolean) {
        mocks.destroy(removeCanvas);
      }
    },
  },
}));

vi.mock("../src/features/town/scenes/TownScene", () => ({
  TownScene: class {
    constructor(...args: unknown[]) {
      mocks.sceneConstructor(...args);
    }
  },
}));

const catalog: TownCatalog = {
  items: [{
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
  }],
};

const state: GameState = {
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

describe("town canvas", () => {
  it("creates the active Phaser scene and destroys the game on unmount", () => {
    const bridge = {
      emit: vi.fn(),
      subscribe: vi.fn(() => vi.fn()),
    } as unknown as TownBridge;
    const { rerender, unmount } = render(
      <TownCanvas bridge={bridge} catalog={catalog} state={state} />,
    );

    expect(screen.getByLabelText("Interactive town map and building drop area")).toBeInTheDocument();
    expect(mocks.sceneConstructor).toHaveBeenCalledWith(bridge, catalog.items, state);
    expect(mocks.gameConstructor).toHaveBeenCalledWith(expect.objectContaining({
      transparent: true,
      scene: [expect.anything()],
      scale: expect.objectContaining({ mode: "RESIZE" }),
    }));

    const updatedState = {
      ...state,
      wallet: { ...state.wallet, coin_balance: 200 },
    };
    rerender(<TownCanvas bridge={bridge} catalog={catalog} state={updatedState} />);
    expect(mocks.gameConstructor).toHaveBeenCalledTimes(1);
    expect(bridge.emit).toHaveBeenCalledWith("stateChanged", { state: updatedState });

    unmount();
    expect(mocks.destroy).toHaveBeenCalledWith(true);
  });

  it("translates catalog drag coordinates into typed scene events", () => {
    const bridge = createTownBridge();
    const moved = vi.fn();
    const dropped = vi.fn();
    bridge.subscribe("catalogDragMoved", moved);
    bridge.subscribe("catalogDropped", dropped);
    render(<TownCanvas bridge={bridge} catalog={catalog} state={state} />);
    const canvas = screen.getByLabelText("Interactive town map and building drop area");
    const data = new Map([[CATALOG_DRAG_TYPE, "woodshed_01"]]);
    const dataTransfer = {
      dropEffect: "none",
      effectAllowed: "copy",
      getData: (type: string) => data.get(type) ?? "",
      setData: (type: string, value: string) => data.set(type, value),
    } as unknown as DataTransfer;

    bridge.emit("catalogDragStarted", { catalogItemId: "woodshed_01" });
    const dragOver = new MouseEvent("dragover", {
      bubbles: true,
      cancelable: true,
      clientX: 24,
      clientY: 31,
    });
    Object.defineProperty(dragOver, "dataTransfer", { value: dataTransfer });
    fireEvent(canvas, dragOver);
    const drop = new MouseEvent("drop", {
      bubbles: true,
      cancelable: true,
      clientX: 44,
      clientY: 51,
    });
    Object.defineProperty(drop, "dataTransfer", { value: dataTransfer });
    fireEvent(canvas, drop);

    expect(moved).toHaveBeenCalledWith({
      catalogItemId: "woodshed_01",
      canvasX: 24,
      canvasY: 31,
    });
    expect(dropped).toHaveBeenCalledWith({
      catalogItemId: "woodshed_01",
      canvasX: 44,
      canvasY: 51,
    });
  });
});
