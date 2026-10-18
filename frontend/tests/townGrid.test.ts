import { describe, expect, it } from "vitest";
import type { GameState, TownCatalogItem } from "../src/api/types";
import {
  buildingDisplayWidth,
  buildingGridPosition,
  buildingWorldPosition,
  clampGridPosition,
  gridToWorld,
  shouldShowPlacementGrid,
  TOWN_GRID_COLUMNS,
  TOWN_GRID_ROWS,
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
    coin_balance: 10_000,
    total_coins_earned: 10_000,
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
  it("centers the expanded staggered grid inside the perimeter gap", () => {
    expect(gridToWorld(0, 0)).toEqual({ x: -1512, y: -828 });
    expect(gridToWorld(0, 1)).toEqual({ x: -1464, y: -804 });
    expect(gridToWorld(31, 69)).toEqual({ x: 1512, y: 828 });
  });

  it("round trips every persisted backend coordinate", () => {
    for (let row = 0; row < TOWN_GRID_ROWS; row += 1) {
      for (let column = 0; column < TOWN_GRID_COLUMNS; column += 1) {
        const world = gridToWorld(column, row);
        expect(worldToGrid(world.x, world.y)).toEqual({ x: column, y: row });
      }
    }
  });

  it("clamps pointer positions to backend grid bounds when requested", () => {
    expect(clampGridPosition({ x: -3, y: 100 })).toEqual({ x: 0, y: 69 });
    expect(worldToGrid(-10_000, -10_000, true)).toEqual({ x: 0, y: 0 });
    expect(worldToGrid(10_000, 10_000, true)).toEqual({ x: 31, y: 69 });
  });

  it("centers multi-cell buildings and uses Kevin's large display scale", () => {
    const twoCellItem = { ...oneCellItem, footprint: { width: 2, height: 2 } };
    const threeCellItem = { ...oneCellItem, footprint: { width: 3, height: 2 } };

    expect(buildingWorldPosition(twoCellItem, 4, 4)).toEqual({ x: -1056, y: -720 });
    expect(buildingDisplayWidth(oneCellItem)).toBe(210);
    expect(buildingDisplayWidth(twoCellItem)).toBe(360);
    expect(buildingDisplayWidth(threeCellItem)).toBe(510);
  });

  it("keeps map bounds and collision rules without district or road restrictions", () => {
    const catalog = [oneCellItem];

    expect(validateTownPlacement(initialState, catalog, oneCellItem, -1, 4)).toEqual({
      valid: false,
      reason: "That footprint extends beyond the town map",
    });
    expect(validateTownPlacement(initialState, catalog, oneCellItem, 15, 14)).toEqual({
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
    expect(validateTownPlacement(initialState, catalog, oneCellItem, 31, 69)).toEqual({
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
