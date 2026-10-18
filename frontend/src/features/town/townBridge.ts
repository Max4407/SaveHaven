import type { BuildingFacing, GameState } from "../../api/types";

export const CATALOG_DRAG_TYPE = "application/x-savehaven-catalog-item";
export const CATALOG_FACING_TYPE = "application/x-savehaven-building-facing";

export type TownBridgeEvents = {
  interactionLocked: { locked: boolean };
  cameraChanged: { zoom: number };
  buildingSelected: { buildingId: number };
  catalogDragStarted: { catalogItemId: string; facing: BuildingFacing };
  buildingDeselected: Record<string, never>;
  catalogDragMoved: { catalogItemId: string; canvasX: number; canvasY: number };
  catalogDropped: {
    catalogItemId: string;
    facing: BuildingFacing;
    canvasX: number;
    canvasY: number;
  };
  placementChanged: { active: boolean; valid: boolean; reason: string | null };
  placementConfirmed: {
    catalogItemId: string;
    buildingId?: number;
    gridX: number;
    gridY: number;
    facing: BuildingFacing;
  };
  startPlacement: {
    catalogItemId: string;
    buildingId?: number;
    facing: BuildingFacing;
  };
  cancelPlacement: Record<string, never>;
  stateChanged: { state: GameState };
};

export type TownBridge = {
  emit<EventName extends keyof TownBridgeEvents>(eventName: EventName, detail: TownBridgeEvents[EventName]): void;
  subscribe<EventName extends keyof TownBridgeEvents>(eventName: EventName, listener: (detail: TownBridgeEvents[EventName]) => void): () => void;
};

export function createTownBridge(): TownBridge {
  const target = new EventTarget();

  return {
    emit(eventName, detail) {
      target.dispatchEvent(new CustomEvent(String(eventName), { detail }));
    },
    subscribe(eventName, listener) {
      const handler = (event: Event) => listener((event as CustomEvent).detail);
      target.addEventListener(String(eventName), handler);
      return () => target.removeEventListener(String(eventName), handler);
    },
  };
}
