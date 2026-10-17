import bakeryUrl from "../../../../Assets/test_bakery.png";
import townhouseUrl from "../../../../Assets/houses-pack/small/townhouse/townhouse_1_new.png";
import wellUrl from "../../../../Assets/houses-pack/small/well/well_1_new.png";

export const BUILDING_DRAG_TYPE = "application/x-savehaven-building";

export const buildingCatalog = [
  {
    id: "mossy-bakery",
    name: "Mossy bakery",
    price: 240,
    level: 1,
    imageUrl: bakeryUrl,
    textureKey: "building-mossy-bakery",
    worldWidth: 440,
  },
  {
    id: "townhouse",
    name: "Townhouse",
    price: 320,
    level: 1,
    imageUrl: townhouseUrl,
    textureKey: "building-townhouse",
    worldWidth: 360,
  },
  {
    id: "village-well",
    name: "Village well",
    price: 180,
    level: 2,
    imageUrl: wellUrl,
    textureKey: "building-village-well",
    worldWidth: 210,
  },
] as const;

export type BuildingId = (typeof buildingCatalog)[number]["id"];

export function isBuildingId(value: string): value is BuildingId {
  return buildingCatalog.some((building) => building.id === value);
}

export function getBuilding(buildingId: BuildingId) {
  return buildingCatalog.find((building) => building.id === buildingId);
}
