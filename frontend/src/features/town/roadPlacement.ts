import type { GameState, TownCatalogItem } from "../../api/types";
import { TOWN_GRID_COLUMNS, TOWN_GRID_ROWS, type GridPosition } from "./townGrid";

export type RoadShape = "line" | "rectangle";

// Trace the two axes of the staggered diamond grid instead of filling endpoint bounds.
export function roadLineCells(start: GridPosition, end: GridPosition): GridPosition[] {
  const startU = start.x + Math.ceil(start.y / 2);
  const startV = Math.floor(start.y / 2) - start.x;
  const deltaU = end.x + Math.ceil(end.y / 2) - startU;
  const deltaV = Math.floor(end.y / 2) - end.x - startV;
  const steps = Math.max(Math.abs(deltaU), Math.abs(deltaV));

  return Array.from({ length: steps + 1 }, (_, index) => {
    const fraction = steps ? index / steps : 0;
    const nextU = Math.floor(startU + deltaU * fraction + 0.5);
    const nextV = Math.floor(startV + deltaV * fraction + 0.5);
    const y = nextU + nextV;
    return { x: nextU - Math.ceil(y / 2), y };
  });
}

function rectangleCells(start: GridPosition, end: GridPosition): GridPosition[] {
  const minX = Math.min(start.x, end.x);
  const maxX = Math.max(start.x, end.x);
  const minY = Math.min(start.y, end.y);
  const maxY = Math.max(start.y, end.y);
  return Array.from({ length: (maxX - minX + 1) * (maxY - minY + 1) }, (_, index) => ({
    x: minX + Math.floor(index / (maxY - minY + 1)),
    y: minY + index % (maxY - minY + 1),
  }));
}

export function roadPlacementPreview(
  state: GameState,
  catalog: TownCatalogItem[],
  item: TownCatalogItem,
  start: GridPosition,
  end: GridPosition,
  shape: RoadShape,
) {
  const cells = shape === "line" ? roadLineCells(start, end) : rectangleCells(start, end);
  const width = Math.abs(end.x - start.x) + 1;
  const height = Math.abs(end.y - start.y) + 1;
  const base = { width, height, cells, newCells: [] as GridPosition[], cost: 0 };
  if (cells.some(({ x, y }) => (
    x < 0 || x >= TOWN_GRID_COLUMNS || y < 0 || y >= TOWN_GRID_ROWS
  ))) {
    return { ...base, valid: false, reason: "That footprint extends beyond the town map" };
  }

  const matchingRoads = new Set<string>();
  const occupied = new Set<string>();
  for (const building of state.buildings) {
    if (building.catalog_item_id === item.id) {
      matchingRoads.add(`${building.grid_x}:${building.grid_y}`);
      continue;
    }
    const placed = catalog.find((candidate) => candidate.id === building.catalog_item_id);
    if (!placed) continue;
    for (let x = building.grid_x; x < building.grid_x + placed.footprint.width; x += 1) {
      for (let y = building.grid_y; y < building.grid_y + placed.footprint.height; y += 1) {
        occupied.add(`${x}:${y}`);
      }
    }
  }

  const newCells = cells.filter(({ x, y }) => !matchingRoads.has(`${x}:${y}`));
  const cost = newCells.length * item.cost_coins;
  const reason = cells.some(({ x, y }) => occupied.has(`${x}:${y}`))
    ? "Another building occupies that space"
    : newCells.length === 0
      ? "Those roads are already placed"
      : cost > state.wallet.coin_balance
        ? "Not enough Coins for these roads"
        : null;
  return { ...base, newCells, cost, valid: reason === null, reason };
}
