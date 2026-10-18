import type { BuildingFacing, GameState } from "../../api/types";

export const CATALOG_DRAG_TYPE = "application/x-savehaven-catalog-item";
export const CATALOG_FACING_TYPE = "application/x-savehaven-building-facing";
export const CATALOG_VARIANT_TYPE = "application/x-savehaven-visual-variant";

export type CharacterDetails = {
  key: string;
  name: string;
  happiness: number;
};

export type TownBridgeEvents = {
  interactionLocked: { locked: boolean };
  cameraChanged: { zoom: number };
  buildingSelected: { buildingId: number };
  characterSelectionChanged: { character: CharacterDetails | null };
  clearCharacterSelection: Record<string, never>;
  foodConsumed: { buildingId: number };
  foodConsumptionRejected: { buildingId: number };
  catalogDragStarted: {
    catalogItemId: string;
    facing: BuildingFacing;
    visualVariant?: number;
  };
  catalogDragMoved: { catalogItemId: string; canvasX: number; canvasY: number };
  catalogDropped: {
    catalogItemId: string;
    facing: BuildingFacing;
    visualVariant?: number;
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
    visualVariant?: number;
  };
  startPlacement: {
    catalogItemId: string;
    buildingId?: number;
    facing: BuildingFacing;
    visualVariant?: number;
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
