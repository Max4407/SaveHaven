import { describe, expect, it } from "vitest";
import {
  FOOD_FRAME_COUNT,
  foodFramePosition,
  randomFoodFrame,
} from "../src/features/town/objects/food";

describe("food sprites", () => {
  it("selects one frame from the 8 by 8 sprite sheet", () => {
    expect(randomFoodFrame(() => 0)).toBe(0);
    expect(randomFoodFrame(() => 0.9999)).toBe(FOOD_FRAME_COUNT - 1);
    expect(foodFramePosition(42)).toEqual({ column: 2, row: 5 });
  });
});
