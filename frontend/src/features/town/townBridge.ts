export type TownBridgeEvents = {
  cameraChanged: { zoom: number };
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
