import type { GameState, TownCatalogItem } from "../../api/types";

export const TOWN_WORLD_WIDTH = 3650;
export const TOWN_WORLD_HEIGHT = 2296;
export const TOWN_WORLD_LEFT = -TOWN_WORLD_WIDTH / 2;
export const TOWN_WORLD_TOP = -TOWN_WORLD_HEIGHT / 2;
export const TOWN_GRID_SIZE = 15;
export const TOWN_GRID_CELL_WIDTH = 96;
export const TOWN_GRID_CELL_HEIGHT = 48;
export const TOWN_GRID_ROW_STEP = TOWN_GRID_CELL_HEIGHT / 2;

const GRID_CENTER_SPAN_X = (TOWN_GRID_SIZE - 1) * TOWN_GRID_CELL_WIDTH
  + TOWN_GRID_CELL_WIDTH / 2;
const GRID_CENTER_SPAN_Y = (TOWN_GRID_SIZE - 1) * TOWN_GRID_ROW_STEP;
const TOWN_GRID_LEFT = -GRID_CENTER_SPAN_X / 2;
const TOWN_GRID_TOP = -GRID_CENTER_SPAN_Y / 2;

export type GridPosition = { x: number; y: number };
export type PlacementValidation = { valid: boolean; reason: string | null };
export type TownPlacementMode = "click" | "catalog-drag" | "building-drag";

function isOffsetRow(row: number) {
  return Math.abs(row % 2) === 1;
}

export function gridToWorld(column: number, row: number): GridPosition {
  return {
    x: TOWN_GRID_LEFT
      + column * TOWN_GRID_CELL_WIDTH
      + (isOffsetRow(row) ? TOWN_GRID_CELL_WIDTH / 2 : 0),
    y: TOWN_GRID_TOP + row * TOWN_GRID_ROW_STEP,
  };
}

export function clampGridPosition(position: GridPosition): GridPosition {
  return {
    x: Math.min(TOWN_GRID_SIZE - 1, Math.max(0, position.x)),
    y: Math.min(TOWN_GRID_SIZE - 1, Math.max(0, position.y)),
  };
}

export function worldToGrid(x: number, y: number, clamp = false): GridPosition {
  const rawRow = Math.round((y - TOWN_GRID_TOP) / TOWN_GRID_ROW_STEP);
  const row = clamp ? clampGridPosition({ x: 0, y: rawRow }).y : rawRow;
  const rowOffset = isOffsetRow(row) ? TOWN_GRID_CELL_WIDTH / 2 : 0;
  const rawColumn = Math.round((x - TOWN_GRID_LEFT - rowOffset) / TOWN_GRID_CELL_WIDTH);
  const position = { x: rawColumn, y: row };
  return clamp ? clampGridPosition(position) : position;
}

export function buildingWorldPosition(
  item: TownCatalogItem,
  gridX: number,
  gridY: number,
): GridPosition {
  let totalX = 0;
  let totalY = 0;
  let cellCount = 0;
  for (let x = gridX; x < gridX + item.footprint.width; x += 1) {
    for (let y = gridY; y < gridY + item.footprint.height; y += 1) {
      const world = gridToWorld(x, y);
      totalX += world.x;
      totalY += world.y;
      cellCount += 1;
    }
  }
  return { x: totalX / cellCount, y: totalY / cellCount };
}

export function buildingDisplayWidth(item: TownCatalogItem): number {
  const largestDimension = Math.max(item.footprint.width, item.footprint.height);
  if (largestDimension >= 3) return 510;
  if (largestDimension === 2) return 360;
  return 210;
}

// Drag coordinates describe the sprite's footprint center, not its top-left cell.
export function buildingGridPosition(item: TownCatalogItem, worldX: number, worldY: number): GridPosition {
  const row = Math.round((worldY - TOWN_GRID_TOP) / TOWN_GRID_ROW_STEP - (item.footprint.height - 1) / 2);
  const center = buildingWorldPosition(item, 0, row);
  return { x: Math.round((worldX - center.x) / TOWN_GRID_CELL_WIDTH), y: row };
}

function footprintCells(item: TownCatalogItem, gridX: number, gridY: number) {
  const cells = new Set<string>();
  for (let x = gridX; x < gridX + item.footprint.width; x += 1) {
    for (let y = gridY; y < gridY + item.footprint.height; y += 1) {
      cells.add(`${x}:${y}`);
    }
  }
  return cells;
}

export function validateTownPlacement(
  state: GameState,
  catalog: TownCatalogItem[],
  item: TownCatalogItem,
  gridX: number,
  gridY: number,
  excludedBuildingId?: number,
): PlacementValidation {
  const cells = footprintCells(item, gridX, gridY);
  if ([...cells].some((key) => {
    const [x, y] = key.split(":").map(Number);
    return x < 0 || x >= TOWN_GRID_SIZE || y < 0 || y >= TOWN_GRID_SIZE;
  })) {
    return { valid: false, reason: "That footprint extends beyond the town map" };
  }

  const occupied = new Set<string>();
  state.buildings.forEach((building) => {
    if (building.id === excludedBuildingId) return;
    const placedItem = catalog.find((candidate) => candidate.id === building.catalog_item_id);
    if (!placedItem) return;
    footprintCells(placedItem, building.grid_x, building.grid_y).forEach((cell) => {
      occupied.add(cell);
    });
  });
  if ([...cells].some((cell) => occupied.has(cell))) {
    return { valid: false, reason: "Another building occupies that space" };
  }
  return { valid: true, reason: null };
}
