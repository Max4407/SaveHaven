import { describe, expect, it } from "vitest";
import { generatePerimeterTrees } from "../src/features/town/perimeterTrees";
import {
  TOWN_WORLD_HEIGHT,
  TOWN_WORLD_WIDTH,
} from "../src/features/town/townGrid";

describe("perimeter trees", () => {
  it("creates a dense, deterministic treeline using every supplied tree variant", () => {
    const first = generatePerimeterTrees(TOWN_WORLD_WIDTH, TOWN_WORLD_HEIGHT);
    const second = generatePerimeterTrees(TOWN_WORLD_WIDTH, TOWN_WORLD_HEIGHT);

    expect(first).toEqual(second);
    expect(first.length).toBeGreaterThanOrEqual(215);
    expect(new Set(first.map((tree) => tree.variant))).toEqual(new Set([1, 2, 3, 4]));
  });

  it("keeps every generated tree close to the map perimeter", () => {
    const trees = generatePerimeterTrees(TOWN_WORLD_WIDTH, TOWN_WORLD_HEIGHT);
    const halfWidth = TOWN_WORLD_WIDTH / 2;
    const halfHeight = TOWN_WORLD_HEIGHT / 2;

    trees.forEach((tree) => {
      expect(Math.abs(tree.x)).toBeLessThan(halfWidth);
      expect(Math.abs(tree.y)).toBeLessThan(halfHeight);
      const distanceFromEdge = Math.min(
        halfWidth - Math.abs(tree.x),
        halfHeight - Math.abs(tree.y),
      );
      expect(distanceFromEdge).toBeLessThan(200);
    });
  });
});
