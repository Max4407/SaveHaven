import { apiRequest } from "./client";
import type { GameReward, GameState, SimulatedWeek, TownCatalog } from "./types";

export function getTownCatalog(): Promise<TownCatalog> {
  return apiRequest<TownCatalog>("/api/game/catalog");
}

export function getGameState(): Promise<GameState> {
  return apiRequest<GameState>("/api/game/state");
}

export function getGameRewards(): Promise<{ rewards: GameReward[] }> {
  return apiRequest<{ rewards: GameReward[] }>("/api/game/rewards");
}

export function buyBuilding(input: {
  catalog_item_id: string;
  grid_x: number;
  grid_y: number;
}): Promise<GameState> {
  return apiRequest<GameState>("/api/game/buildings", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function moveBuilding(
  buildingId: number,
  input: { grid_x: number; grid_y: number },
): Promise<GameState> {
  return apiRequest<GameState>(`/api/game/buildings/${buildingId}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export function sellBuilding(buildingId: number): Promise<GameState> {
  return apiRequest<GameState>(`/api/game/buildings/${buildingId}`, { method: "DELETE" });
}

export function simulateWeek(
  scenario: "successful" | "off-plan",
  idempotencyKey: string,
): Promise<SimulatedWeek> {
  return apiRequest<SimulatedWeek>(`/api/demo/simulate-${scenario}-week`, {
    method: "POST",
    body: JSON.stringify({ idempotency_key: idempotencyKey }),
  });
}

export function resetDemo(): Promise<{ game_state: GameState; cleanup_warnings: string[] }> {
  return apiRequest<{ game_state: GameState; cleanup_warnings: string[] }>("/api/demo/reset", {
    method: "POST",
  });
}
