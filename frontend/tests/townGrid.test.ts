import { describe, expect, it } from "vitest";
import type { GameState, TownCatalogItem } from "../src/api/types";
import {
  buildingDisplayWidth,
  buildingWorldPosition,
  clampGridPosition,
  gridToWorld,
  shouldShowPlacementGrid,
  TOWN_GRID_SIZE,
  validateTownPlacement,
  worldToGrid,
} from "../src/features/town/townGrid";

const oneCellItem: TownCatalogItem = {
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
  buildings: [{
    id: 7,
    catalog_item_id: oneCellItem.id,
    grid_x: 5,
    grid_y: 5,
    purchase_price_coins: 100,
    purchased_at: "2026-10-17T12:00:00Z",
    updated_at: "2026-10-17T12:00:00Z",
  }],
};

describe("town grid", () => {
  it("centers the 16 by 16 staggered grid and offsets odd rows", () => {
    expect(gridToWorld(0, 0)).toEqual({ x: -744, y: -180 });
    expect(gridToWorld(0, 1)).toEqual({ x: -696, y: -156 });
    expect(gridToWorld(15, 15)).toEqual({ x: 744, y: 180 });
  });

  it("round trips every persisted backend coordinate", () => {
    for (let row = 0; row < TOWN_GRID_SIZE; row += 1) {
      for (let column = 0; column < TOWN_GRID_SIZE; column += 1) {
        const world = gridToWorld(column, row);
        expect(worldToGrid(world.x, world.y)).toEqual({ x: column, y: row });
      }
    }
  });

  it("clamps pointer positions to backend grid bounds when requested", () => {
    expect(clampGridPosition({ x: -3, y: 20 })).toEqual({ x: 0, y: 15 });
    expect(worldToGrid(-10_000, -10_000, true)).toEqual({ x: 0, y: 0 });
    expect(worldToGrid(10_000, 10_000, true)).toEqual({ x: 15, y: 15 });
  });

  it("centers multi-cell buildings and uses Kevin's large display scale", () => {
    const twoCellItem = { ...oneCellItem, footprint: { width: 2, height: 2 } };
    const threeCellItem = { ...oneCellItem, footprint: { width: 3, height: 2 } };

    expect(buildingWorldPosition(twoCellItem, 4, 4)).toEqual({ x: -288, y: -72 });
    expect(buildingDisplayWidth(oneCellItem)).toBe(210);
    expect(buildingDisplayWidth(twoCellItem)).toBe(360);
    expect(buildingDisplayWidth(threeCellItem)).toBe(510);
  });

  it("shows the placement grid only during drag-and-drop", () => {
    expect(shouldShowPlacementGrid("catalog-drag")).toBe(true);
    expect(shouldShowPlacementGrid("building-drag")).toBe(true);
    expect(shouldShowPlacementGrid("click")).toBe(false);
  });

  it("keeps map bounds and collision rules without district or road restrictions", () => {
    const catalog = [oneCellItem];

    expect(validateTownPlacement(initialState, catalog, oneCellItem, -1, 4)).toEqual({
      valid: false,
      reason: "That footprint extends beyond the town map",
    });
    expect(validateTownPlacement(initialState, catalog, oneCellItem, 3, 4)).toEqual({
      valid: true,
      reason: null,
    });
    expect(validateTownPlacement(initialState, catalog, oneCellItem, 7, 7)).toEqual({
      valid: true,
      reason: null,
    });
    expect(validateTownPlacement(initialState, catalog, oneCellItem, 5, 5)).toEqual({
      valid: false,
      reason: "Another building occupies that space",
    });
    expect(validateTownPlacement(initialState, catalog, oneCellItem, 5, 5, 7)).toEqual({
      valid: true,
      reason: null,
    });
  });
});
