// @vitest-environment jsdom

import { describe, expect, it, vi } from "vitest";
import type { GameState, TownCatalogItem } from "../src/api/types";
import { TownScene } from "../src/features/town/scenes/TownScene";
import { createTownBridge } from "../src/features/town/townBridge";
import { buildingWorldPosition } from "../src/features/town/townGrid";

vi.mock("phaser", () => ({
  default: {
    Scene: class {},
    Math: { Vector2: class { set() {} } },
  },
}));

// Exercise the scene's input handlers without requiring WebGL in jsdom.
function inputHarness(catalog: TownCatalogItem[] = []) {
  const bridge = createTownBridge();
  const scene = new TownScene(bridge, catalog, { buildings: [] } as unknown as GameState);
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
    placement?: { mode: string; buildingId?: number; valid?: boolean; catalogItemId?: string; facing?: "left" | "right"; gridX?: number; gridY?: number };
    placementPointerDown: boolean;
    interactionLocked: boolean;
    cameras: { main: { scrollX: number; scrollY: number } };
    scale: { width: number; height: number };
    game: { canvas: unknown };
    refreshPreview(): void;
  };
  internals.input = input;
  internals.configureInput();
  return { bridge, handlers, keys, input, internals };
}

describe("town scene input", () => {
  it("mirrors right-facing buildings but never mirrors ground tiles", () => {
    const scene = new TownScene(createTownBridge(), [], { buildings: [] } as unknown as GameState);
    const setFlipX = vi.fn();
    const setOrigin = vi.fn();
    const internals = scene as unknown as {
      applyFacing(
        image: {
          width: number;
          height: number;
          setFlipX: (flipped: boolean) => void;
          setOrigin: (x: number, y: number) => void;
        },
        item: TownCatalogItem,
        facing: "left" | "right",
      ): void;
    };

    const image = { width: 100, height: 80, setFlipX, setOrigin };
    const building = {
      render_kind: "building",
      pivot: { x: 30, y: 60 },
    } as TownCatalogItem;
    const ground = {
      render_kind: "ground",
      pivot: { x: 30, y: 60 },
    } as TownCatalogItem;
    internals.applyFacing(image, building, "right");
    internals.applyFacing(image, ground, "right");

    expect(setFlipX).toHaveBeenNthCalledWith(1, true);
    expect(setFlipX).toHaveBeenNthCalledWith(2, false);
    expect(setOrigin).toHaveBeenNthCalledWith(1, 0.7, 0.75);
    expect(setOrigin).toHaveBeenNthCalledWith(2, 0.3, 0.75);
  });

  it("preserves existing resident positions while homes are moved or added", () => {
    const item = {
      id: "hut_01",
      footprint: { width: 2, height: 2 },
      resident_count: 1,
    } as TownCatalogItem;
    const state = {
      buildings: [{ id: 7, catalog_item_id: item.id, grid_x: 8, grid_y: 8 }],
    } as GameState;
    const scene = new TownScene(createTownBridge(), [item], state);
    const sprite = {
      x: 321,
      y: 456,
      destroy: vi.fn(),
      setPosition: vi.fn(),
    };
    const home = { set: vi.fn() };
    const resident = {
      key: "7:0",
      sprite,
      home,
      target: { copy: vi.fn() },
      variant: 2,
      speed: 72,
      mode: "wandering",
      remainingStops: 2,
      insideUntil: 0,
    };
    const internals = scene as unknown as {
      ambientCharacters: Array<typeof resident>;
      state: GameState;
      reconcileAmbientCharacters(): void;
    };
    internals.ambientCharacters = [resident];

    internals.reconcileAmbientCharacters();

    expect(sprite.x).toBe(321);
    expect(sprite.y).toBe(456);
    expect(sprite.setPosition).not.toHaveBeenCalled();
    expect(sprite.destroy).not.toHaveBeenCalled();
    expect(home.set).toHaveBeenCalledOnce();
  });

  it.each([1, 2, 3])("submits the previewed cell for a valid building drag with side length %s", (size) => {
    const item = { id: "shed", footprint: { width: size, height: size } } as TownCatalogItem;
    const { bridge, handlers, internals } = inputHarness([item]);
    const confirmed = vi.fn();
    bridge.subscribe("placementConfirmed", confirmed);
    internals.placement = { mode: "building-drag", buildingId: 7, catalogItemId: "shed", facing: "right", valid: true };
    internals.refreshPreview = vi.fn();
    internals.scale = { width: 800, height: 600 };
    const canvas = {};
    internals.game = { canvas };
    const center = buildingWorldPosition(item, 6, 5);
    const sprite = { getData: () => 7 };
    handlers.get("drag")!({}, sprite, center.x, center.y);
    expect(internals.refreshPreview).toHaveBeenCalledOnce();
    handlers.get("dragend")!({ x: 100, y: 100, event: { target: canvas } }, sprite);
    expect(confirmed).toHaveBeenCalledWith({
      catalogItemId: "shed",
      buildingId: 7,
      facing: "right",
      gridX: 6,
      gridY: 5,
    });
  });

  it("does not start a building drag while a server action is pending", () => {
    const { handlers, internals } = inputHarness();
    internals.interactionLocked = true;
    const getData = vi.fn();
    handlers.get("dragstart")!({}, { getData });
    expect(getData).not.toHaveBeenCalled();
    expect(internals.placement).toBeUndefined();
  });

  it.each(["outside", "overlay", "invalid"])("cancels an %s drop instead of submitting a move", (kind) => {
    const { bridge, handlers, internals } = inputHarness();
    const confirmed = vi.fn();
    bridge.subscribe("placementConfirmed", confirmed);
    internals.scale = { width: 800, height: 600 };
    const canvas = {};
    internals.game = { canvas };
    internals.placement = { mode: "building-drag", buildingId: 7, valid: kind !== "invalid" };
    handlers.get("dragend")!({ x: kind === "outside" ? 900 : 100, y: 100,
      event: { target: kind === "overlay" ? {} : canvas },
    }, { getData: () => 7 });
    expect(confirmed).not.toHaveBeenCalled();
    expect(internals.placement).toBeUndefined();
  });

  it("requires movement before dragging so a stationary click can select a building", () => {
    const { input } = inputHarness();
    // Phaser's zero default consumes pointerdown as dragstart, hiding Move/Sell selection.
    expect(input.dragDistanceThreshold).toBe(7);
  });

  it("deselects a building when the user clicks empty map space", () => {
    const { bridge, handlers, internals } = inputHarness();
    const deselected = vi.fn();
    bridge.subscribe("buildingDeselected", deselected);
    internals.cameras = { main: { scrollX: 0, scrollY: 0 } };

    handlers.get("pointerdown")!({ x: 20, y: 30 }, []);
    handlers.get("pointerup")!({ getDistance: () => 0 });

    expect(deselected).toHaveBeenCalledOnce();
  });

  it("keeps the selection while panning the map or clicking a building", () => {
    const { bridge, handlers, internals } = inputHarness();
    const deselected = vi.fn();
    bridge.subscribe("buildingDeselected", deselected);
    internals.cameras = { main: { scrollX: 0, scrollY: 0 } };

    handlers.get("pointerdown")!({ x: 20, y: 30 }, []);
    handlers.get("pointerup")!({ getDistance: () => 12 });
    handlers.get("pointerdown")!({}, [{ getData: () => true }]);
    handlers.get("pointerup")!({ getDistance: () => 0 });

    expect(deselected).not.toHaveBeenCalled();
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

describe("town scene camera", () => {
  it("starts at the minimum zoom so the town opens fully zoomed out", () => {
    const bridge = createTownBridge();
    const scene = new TownScene(bridge, [], { buildings: [] } as unknown as GameState);
    const camera = {
      zoom: 1.1,
      scrollX: 0,
      scrollY: 0,
      roundPixels: false,
      setBounds: vi.fn(),
      centerOn: vi.fn(),
      setZoom: vi.fn(),
      clampX: vi.fn((value: number) => value),
      clampY: vi.fn((value: number) => value),
    };
    const internals = scene as unknown as {
      cameras: { main: typeof camera };
      scale: { width: number; height: number };
      configureCamera(): void;
    };
    internals.cameras = { main: camera };
    internals.scale = { width: 800, height: 600 };

    internals.configureCamera();

    expect(camera.setZoom).toHaveBeenCalledWith(0.4);
    expect(camera.centerOn).toHaveBeenCalledWith(0, 0);
  });
});
