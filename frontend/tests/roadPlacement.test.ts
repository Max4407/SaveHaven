import { describe, expect, it } from "vitest";
import type { GameState, PlacedBuilding, TownCatalogItem } from "../src/api/types";
import {
  roadLineCells,
  roadPlacementPreview,
} from "../src/features/town/roadPlacement";

const road = { id: "road", cost_coins: 1, footprint: { width: 1, height: 1 } } as TownCatalogItem;
const hut = { id: "hut", footprint: { width: 2, height: 2 } } as TownCatalogItem;
const state = { wallet: { coin_balance: 20 }, buildings: [] } as unknown as GameState;

describe("multi-road placement", () => {
  it("traces one straight diagonal instead of filling its bounding area", () => {
    const start = { x: 4, y: 4 };
    const end = { x: 7, y: 10 };
    const expected = [
      { x: 4, y: 4 }, { x: 4, y: 5 }, { x: 5, y: 6 }, { x: 5, y: 7 },
      { x: 6, y: 8 }, { x: 6, y: 9 }, { x: 7, y: 10 },
    ];
    expect(roadLineCells(start, end)).toEqual(expected);
    expect(roadLineCells(end, start)).toEqual([...expected].reverse());
    expect(roadPlacementPreview(state, [road], road, start, end, "line"))
      .toMatchObject({ cells: expected, newCells: expected, cost: 7, valid: true });
  });

  it("keeps horizontal and vertical drags narrow on staggered rows", () => {
    expect(roadLineCells({ x: 4, y: 4 }, { x: 8, y: 4 })).toEqual(
      [4, 5, 6, 7, 8].map((x) => ({ x, y: 4 })),
    );
    expect(roadLineCells({ x: 4, y: 4 }, { x: 4, y: 12 })).toEqual(
      [4, 6, 8, 10, 12].map((y) => ({ x: 4, y })),
    );
  });

  it("fills a rectangle only when Area is selected", () => {
    const result = roadPlacementPreview(
      state, [road], road, { x: 4, y: 4 }, { x: 7, y: 5 }, "rectangle",
    );
    expect(result).toMatchObject({ width: 4, height: 2, cost: 8, valid: true });
    expect(result.newCells).toHaveLength(8);
  });

  it("skips existing roads but blocks buildings and unaffordable selections", () => {
    const placed = {
      ...state,
      buildings: [{ catalog_item_id: "road", grid_x: 4, grid_y: 4 } as PlacedBuilding],
    };
    expect(roadPlacementPreview(
      placed, [road], road, { x: 4, y: 4 }, { x: 7, y: 5 }, "rectangle",
    )).toMatchObject({ cost: 7, valid: true });

    const blocked = {
      ...state,
      buildings: [{ catalog_item_id: "hut", grid_x: 5, grid_y: 6 } as PlacedBuilding],
    };
    expect(roadPlacementPreview(
      blocked, [road, hut], road, { x: 4, y: 4 }, { x: 7, y: 10 }, "line",
    )).toMatchObject({ valid: false, reason: "Another building occupies that space" });
    expect(roadPlacementPreview(
      state, [road], road, { x: 0, y: 0 }, { x: 25, y: 0 }, "line",
    )).toMatchObject({ valid: false, reason: "Not enough Coins for these roads" });
  });
});
