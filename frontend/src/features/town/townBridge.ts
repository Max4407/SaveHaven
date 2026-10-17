import type { GameState } from "../../api/types";

export type TownBridgeEvents = {
  cameraChanged: { zoom: number };
  buildingSelected: { buildingId: number };
  placementChanged: { active: boolean; valid: boolean; reason: string | null };
  placementConfirmed: {
    catalogItemId: string;
    buildingId?: number;
    gridX: number;
    gridY: number;
  };
  startPlacement: { catalogItemId: string; buildingId?: number };
  cancelPlacement: Record<string, never>;
  stateChanged: { state: GameState };
  buildingDragStarted: { buildingId: BuildingId };
  buildingDragMoved: { screenX: number; screenY: number };
  buildingDragEnded: Record<string, never>;
  buildingDropped: { buildingId: BuildingId; screenX: number; screenY: number };
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
