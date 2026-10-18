export const FOOD_FRAME_SIZE = 16;
export const FOOD_SHEET_COLUMNS = 8;
export const FOOD_FRAME_COUNT = 64;

export function randomFoodFrame(random: () => number = Math.random): number {
  return Math.min(FOOD_FRAME_COUNT - 1, Math.floor(random() * FOOD_FRAME_COUNT));
}

export function foodFramePosition(frame: number): { column: number; row: number } {
  const safeFrame = Math.max(0, Math.min(FOOD_FRAME_COUNT - 1, Math.floor(frame)));
  return {
    column: safeFrame % FOOD_SHEET_COLUMNS,
    row: Math.floor(safeFrame / FOOD_SHEET_COLUMNS),
  };
}
