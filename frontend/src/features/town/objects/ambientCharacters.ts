import type { GameState, TownCatalogItem } from "../../../api/types";

export const AMBIENT_CHARACTER_VARIANTS = [1, 2, 3, 4, 5, 6] as const;

export type AmbientCharacterVariant = typeof AMBIENT_CHARACTER_VARIANTS[number];
export type CharacterDirection = "down" | "left" | "right" | "up";
export type ResidentAssignment = {
  key: string;
  name: string;
  buildingId: number;
  catalogItemId: string;
  residentIndex: number;
  variant: AmbientCharacterVariant;
};

export const MAX_CHARACTER_HAPPINESS = 100;
export const CHARACTER_HAPPINESS_DECAY_PER_SECOND = 1 / (20 * 60);
export const FOOD_HAPPINESS_RESTORE = 30;

const CHARACTER_NAMES = [
  "Rowan", "Mira", "Theo", "Ivy", "Finn", "Nora", "Jasper", "Lina",
  "Milo", "Wren", "Ada", "Eli", "Poppy", "Silas", "Mae", "Otis",
] as const;

const CHARACTER_ASSET_DIRECTORY = "/Free%20Character%20Sprites%20-%20Fantasy%20Dreamland/16x16";
const DIRECTION_ROWS: Record<CharacterDirection, number> = {
  down: 0,
  left: 1,
  right: 2,
  up: 3,
};

export function characterAssetUrl(variant: AmbientCharacterVariant): string {
  return `${CHARACTER_ASSET_DIRECTORY}/Char_${String(variant).padStart(3, "0")}.png`;
}

export function characterTextureKey(variant: AmbientCharacterVariant): string {
  return `ambient-character-${variant}`;
}

export function characterAnimationKey(
  variant: AmbientCharacterVariant,
  direction: CharacterDirection,
): string {
  return `${characterTextureKey(variant)}-${direction}`;
}

export function characterAnimationFrames(direction: CharacterDirection): {
  start: number;
  end: number;
} {
  const start = DIRECTION_ROWS[direction] * 4;
  return { start, end: start + 3 };
}

export function characterDirection(deltaX: number, deltaY: number): CharacterDirection {
  if (Math.abs(deltaX) > Math.abs(deltaY)) return deltaX < 0 ? "left" : "right";
  return deltaY < 0 ? "up" : "down";
}

export function residentAssignmentKey(buildingId: number, residentIndex: number): string {
  return `${buildingId}:${residentIndex}`;
}

export function residentName(buildingId: number, residentIndex: number): string {
  return CHARACTER_NAMES[(buildingId * 5 + residentIndex * 3) % CHARACTER_NAMES.length];
}

export function decayCharacterHappiness(happiness: number, elapsedSeconds: number): number {
  return Math.max(0, happiness - elapsedSeconds * CHARACTER_HAPPINESS_DECAY_PER_SECOND);
}

export function feedCharacter(happiness: number): number {
  return Math.min(MAX_CHARACTER_HAPPINESS, happiness + FOOD_HAPPINESS_RESTORE);
}

export function createResidentAssignments(
  state: GameState,
  catalog: TownCatalogItem[],
): ResidentAssignment[] {
  const catalogById = new Map(catalog.map((item) => [item.id, item]));
  const residents: ResidentAssignment[] = [];
  state.buildings.forEach((building) => {
    const residentCount = catalogById.get(building.catalog_item_id)?.resident_count ?? 0;
    for (let residentIndex = 0; residentIndex < residentCount; residentIndex += 1) {
      residents.push({
        key: residentAssignmentKey(building.id, residentIndex),
        name: residentName(building.id, residentIndex),
        buildingId: building.id,
        catalogItemId: building.catalog_item_id,
        residentIndex,
        variant: AMBIENT_CHARACTER_VARIANTS[
          (building.id + residentIndex) % AMBIENT_CHARACTER_VARIANTS.length
        ],
      });
    }
  });
  return residents;
}
