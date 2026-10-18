// @vitest-environment jsdom

import { describe, expect, it, vi } from "vitest";
import type { GameState } from "../src/api/types";
import { TownScene } from "../src/features/town/scenes/TownScene";
import { createTownBridge } from "../src/features/town/townBridge";

vi.mock("phaser", () => ({
  default: {
    Scene: class {},
    Math: { Vector2: class { set() {} } },
  },
}));

// Exercise the scene's input handlers without requiring WebGL in jsdom.
function inputHarness() {
  const bridge = createTownBridge();
  const scene = new TownScene(bridge, [], { buildings: [] } as unknown as GameState);
  const handlers = new Map<string, (...args: unknown[]) => void>();
  const keys = new Map<string, () => void>();
  const input = {
    dragDistanceThreshold: 0,
    on: (name: string, handler: (...args: unknown[]) => void) => handlers.set(name, handler),
    keyboard: { on: (name: string, handler: () => void) => keys.set(name, handler) },
  };
  const internals = scene as unknown as {
    input: typeof input;
    configureInput(): void;
    placement?: { mode: string; buildingId?: number };
    placementPointerDown: boolean;
  };
  internals.input = input;
  internals.configureInput();
  return { bridge, handlers, keys, input, internals };
}

describe("town scene input", () => {
  it("requires movement before dragging so a stationary click can select a building", () => {
    const { input } = inputHarness();
    // Phaser's zero default consumes pointerdown as dragstart, hiding Move/Sell selection.
    expect(input.dragDistanceThreshold).toBe(7);
  });

  it("does not replace a catalog preview when dragging across an owned building", () => {
    const { handlers, internals } = inputHarness();
    const preview = { mode: "click" };
    internals.placement = preview;
    const getData = vi.fn();
    handlers.get("dragstart")!({}, { getData });
    expect(getData).not.toHaveBeenCalled();
    expect(internals.placement).toBe(preview);
  });

  it("Escape cancels the preview without confirming a purchase or move", () => {
    const { bridge, keys, internals } = inputHarness();
    const confirmed = vi.fn();
    const changed = vi.fn();
    bridge.subscribe("placementConfirmed", confirmed);
    bridge.subscribe("placementChanged", changed);
    internals.placement = { mode: "click" };
    internals.placementPointerDown = true;
    keys.get("keydown-ESC")!();
    expect(internals.placement).toBeUndefined();
    expect(internals.placementPointerDown).toBe(false);
    expect(confirmed).not.toHaveBeenCalled();
    expect(changed).toHaveBeenCalledWith({ active: false, valid: false, reason: null });
  });
});
