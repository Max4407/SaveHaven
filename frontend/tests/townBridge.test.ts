import { describe, expect, it, vi } from "vitest";
import { createTownBridge } from "../src/features/town/townBridge";

describe("town bridge", () => {
  it("passes typed placement events and allows listeners to unsubscribe", () => {
    const bridge = createTownBridge();
    const listener = vi.fn();
    const unsubscribe = bridge.subscribe("placementConfirmed", listener);

    bridge.emit("placementConfirmed", {
      catalogItemId: "woodshed_01",
      gridX: 4,
      gridY: 5,
    });
    unsubscribe();
    bridge.emit("placementConfirmed", {
      catalogItemId: "hut_01",
      gridX: 6,
      gridY: 6,
    });

    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith({
      catalogItemId: "woodshed_01",
      gridX: 4,
      gridY: 5,
    });
  });
});
