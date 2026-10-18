import { describe, expect, it } from "vitest";
import {
  characterAnimationFrames,
  characterAssetUrl,
  characterDirection,
  createResidentAssignments,
} from "../src/features/town/objects/ambientCharacters";
import type { GameState, TownCatalogItem } from "../src/api/types";

describe("ambient character sprites", () => {
  it("maps the four documented walking rows to their four frames", () => {
    expect(characterAnimationFrames("down")).toEqual({ start: 0, end: 3 });
    expect(characterAnimationFrames("left")).toEqual({ start: 4, end: 7 });
    expect(characterAnimationFrames("right")).toEqual({ start: 8, end: 11 });
    expect(characterAnimationFrames("up")).toEqual({ start: 12, end: 15 });
  });

  it("uses only the licensed 16x16 character set", () => {
    expect(characterAssetUrl(1)).toBe(
      "/Free%20Character%20Sprites%20-%20Fantasy%20Dreamland/16x16/Char_001.png",
    );
    expect(characterAssetUrl(6)).toContain("/16x16/Char_006.png");
  });

  it("selects the animation facing the dominant travel direction", () => {
    expect(characterDirection(-20, 4)).toBe("left");
    expect(characterDirection(20, 4)).toBe("right");
    expect(characterDirection(4, -20)).toBe("up");
    expect(characterDirection(4, 20)).toBe("down");
  });

  it("creates and removes residents from the currently placed population buildings", () => {
    const catalog = [
      { id: "hut_01", resident_count: 1 },
      { id: "cottage_01", resident_count: 2 },
      { id: "well_01", resident_count: 0 },
    ] as TownCatalogItem[];
    const buildings = [
      { id: 1, catalog_item_id: "hut_01" },
      { id: 2, catalog_item_id: "cottage_01" },
      { id: 3, catalog_item_id: "well_01" },
    ];
    const state = { buildings } as GameState;

    expect(createResidentAssignments(state, catalog)).toHaveLength(3);
    expect(createResidentAssignments(
      { ...state, buildings: buildings.slice(1) } as GameState,
      catalog,
    )).toHaveLength(2);
  });
});
