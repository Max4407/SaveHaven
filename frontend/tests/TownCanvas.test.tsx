// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { createEvent, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { TownCanvas } from "../src/features/town/TownCanvas";
import { BUILDING_DRAG_TYPE } from "../src/features/town/catalog/buildingCatalog";
import type { TownBridge } from "../src/features/town/townBridge";

vi.mock("phaser", () => ({
  default: {
    AUTO: "AUTO",
    Scale: { RESIZE: "RESIZE" },
    Game: class {
      destroy() {}
    },
  },
}));

vi.mock("../src/features/town/scenes/EmptyTownScene", () => ({
  EmptyTownScene: class {},
}));

describe("town canvas placement bridge", () => {
  it("converts a catalog drop into canvas-relative placement coordinates", () => {
    const emit = vi.fn();
    const bridge = { emit, subscribe: vi.fn() } as unknown as TownBridge;
    render(<TownCanvas bridge={bridge} />);

    const map = screen.getByLabelText("Interactive town map and building drop area");
    vi.spyOn(map, "getBoundingClientRect").mockReturnValue({
      left: 20,
      top: 30,
      right: 820,
      bottom: 630,
      width: 800,
      height: 600,
      x: 20,
      y: 30,
      toJSON: () => ({}),
    });

    const dropEvent = createEvent.drop(map);
    Object.defineProperties(dropEvent, {
      clientX: { value: 220 },
      clientY: { value: 180 },
      dataTransfer: { value: {
        getData: (type: string) => type === BUILDING_DRAG_TYPE ? "townhouse" : "",
      } },
    });
    fireEvent(map, dropEvent);

    expect(emit).toHaveBeenCalledWith("buildingDropped", {
      buildingId: "townhouse",
      screenX: 200,
      screenY: 150,
    });
    expect(emit).toHaveBeenCalledWith("buildingDragEnded", {});
  });
});
