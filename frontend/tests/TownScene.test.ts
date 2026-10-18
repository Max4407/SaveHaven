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
    placement?: { mode: string; buildingId?: number; valid?: boolean; catalogItemId?: string; gridX?: number; gridY?: number };
    placementPointerDown: boolean;
    interactionLocked: boolean;
    scale: { width: number; height: number };
    game: { canvas: unknown };
    refreshPreview(): void;
  };
  internals.input = input;
  internals.configureInput();
  return { bridge, handlers, keys, input, internals };
}

describe("town scene input", () => {
  it.each([1, 2, 3])("submits the previewed cell for a valid building drag with side length %s", (size) => {
    const item = { id: "shed", footprint: { width: size, height: size } } as TownCatalogItem;
    const { bridge, handlers, internals } = inputHarness([item]);
    const confirmed = vi.fn();
    bridge.subscribe("placementConfirmed", confirmed);
    internals.placement = { mode: "building-drag", buildingId: 7, catalogItemId: "shed", valid: true };
    internals.refreshPreview = vi.fn();
    internals.scale = { width: 800, height: 600 };
    const canvas = {};
    internals.game = { canvas };
    const center = buildingWorldPosition(item, 6, 5);
    const sprite = { getData: () => 7 };
    handlers.get("drag")!({}, sprite, center.x, center.y);
    expect(internals.refreshPreview).toHaveBeenCalledOnce();
    handlers.get("dragend")!({ x: 100, y: 100, event: { target: canvas } }, sprite);
    expect(confirmed).toHaveBeenCalledWith({ catalogItemId: "shed", buildingId: 7, gridX: 6, gridY: 5 });
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

  it.each(["click", "catalog-drag", "building-drag"])("shows placement guides during %s placement", (mode) => {
    const scene = new TownScene(createTownBridge(), [{
      id: "shed",
      footprint: { width: 1, height: 1 },
    } as TownCatalogItem], {
      buildings: [], district: { min_x: 4, min_y: 4 },
      infrastructure: { tier: "dirt", reserved_cells: [{ x: 7, y: 7 }] },
    } as unknown as GameState);
    const graphics = () => ({
      setVisible: vi.fn(), fillStyle: vi.fn(), lineStyle: vi.fn(),
      fillPoints: vi.fn(), strokePoints: vi.fn(),
    });
    const grid = graphics();
    const background = { setDisplaySize: vi.fn().mockReturnThis(), setDepth: vi.fn().mockReturnThis() };
    const tree = {
      setScale: vi.fn().mockReturnThis(),
      setFlipX: vi.fn().mockReturnThis(),
      setDepth: vi.fn().mockReturnThis(),
    };
    const internals = scene as unknown as {
      add: unknown;
      drawMap(): void;
      startPlacement(detail: { catalogItemId: string }, mode: string): void;
      cancelPlacement(): void;
      refreshPreview(): void;
    };
    const addGraphics = vi.fn().mockReturnValue(grid);
    internals.add = {
      image: (_x: number, _y: number, key: string) => (
        key === "grass-background" ? background : tree
      ),
      graphics: addGraphics,
    };
    internals.refreshPreview = vi.fn();
    internals.drawMap();
    expect(grid.setVisible).toHaveBeenLastCalledWith(false);
    // Only the hidden placement guide is drawn; no permanent road overlay.
    expect(addGraphics).toHaveBeenCalledTimes(1);
    expect(grid.fillStyle).toHaveBeenCalledWith(0xc4483d, 0.2);
    internals.startPlacement({ catalogItemId: "shed" }, mode);
    expect(grid.setVisible).toHaveBeenLastCalledWith(true);
    internals.cancelPlacement();
    expect(grid.setVisible).toHaveBeenLastCalledWith(false);
  });

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
