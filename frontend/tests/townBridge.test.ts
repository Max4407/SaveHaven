import { describe, expect, it, vi } from "vitest";
import { createTownBridge } from "../src/features/town/townBridge";

describe("town bridge", () => {
  it("passes typed placement events and allows listeners to unsubscribe", () => {
    const bridge = createTownBridge();
    const listener = vi.fn();
    const unsubscribe = bridge.subscribe("placementConfirmed", listener);

    bridge.emit("placementConfirmed", {
      catalogItemId: "woodshed_01",
      facing: "right",
      gridX: 4,
      gridY: 5,
    });
    unsubscribe();
    bridge.emit("placementConfirmed", {
      catalogItemId: "hut_01",
      facing: "left",
      gridX: 6,
      gridY: 6,
    });

    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith({
      catalogItemId: "woodshed_01",
      facing: "right",
      gridX: 4,
      gridY: 5,
    });
  });

  it("carries server catalog ids and canvas coordinates through drag events", () => {
    const bridge = createTownBridge();
    const listener = vi.fn();
    bridge.subscribe("catalogDropped", listener);

    bridge.emit("catalogDropped", {
      catalogItemId: "bakery_01",
      facing: "right",
      canvasX: 320,
      canvasY: 180,
    });

    expect(listener).toHaveBeenCalledWith({
      catalogItemId: "bakery_01",
      facing: "right",
      canvasX: 320,
      canvasY: 180,
    });
  });
});
