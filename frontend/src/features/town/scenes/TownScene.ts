import Phaser from "phaser";
import grassDetailUrl from "../../../../Assets/free_grass/1.png";
import type { GameState, PlacedBuilding, TownCatalogItem } from "../../../api/types";
import type { TownBridge } from "../townBridge";

const GRID_SIZE = 16;
const TILE_WIDTH = 68;
const TILE_HEIGHT = 34;
const MAP_TOP = -270;

type Placement = {
  catalogItemId: string;
  buildingId?: number;
  gridX: number;
  gridY: number;
  valid: boolean;
  reason: string | null;
};

export class TownScene extends Phaser.Scene {
  private readonly bridge: TownBridge;
  private readonly catalog: TownCatalogItem[];
  private state: GameState;
  private isDragging = false;
  private dragStart = new Phaser.Math.Vector2();
  private cameraStart = new Phaser.Math.Vector2();
  private mapLayer?: Phaser.GameObjects.Container;
  private buildingLayer?: Phaser.GameObjects.Container;
  private previewLayer?: Phaser.GameObjects.Container;
  private placement?: Placement;
  private unsubscribers: Array<() => void> = [];

  constructor(bridge: TownBridge, catalog: TownCatalogItem[], state: GameState) {
    super("town");
    this.bridge = bridge;
    this.catalog = catalog;
    this.state = state;
  }

  preload() {
    this.load.image("grass-detail", grassDetailUrl);
    this.catalog.forEach((item) => {
      this.load.image(`building-${item.id}`, item.asset);
      this.load.image(`shadow-${item.id}`, item.shadow_asset);
    });
  }

  create() {
    this.cameras.main.setBackgroundColor("#c9e4dd");
    this.renderWorld();
    this.configureCamera();
    this.configureInput();
    this.unsubscribers = [
      this.bridge.subscribe("startPlacement", (detail) => this.startPlacement(detail)),
      this.bridge.subscribe("cancelPlacement", () => this.cancelPlacement()),
      this.bridge.subscribe("stateChanged", ({ state }) => {
        this.state = state;
        this.cancelPlacement();
        this.renderWorld();
      }),
    ];
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.unsubscribers.forEach((unsubscribe) => unsubscribe());
      this.unsubscribers = [];
    });
  }

  private renderWorld() {
    this.mapLayer?.destroy(true);
    this.buildingLayer?.destroy(true);
    this.mapLayer = this.add.container(0, 0).setDepth(-1000);
    this.buildingLayer = this.add.container(0, 0);
    this.drawMap();
    this.state.buildings.forEach((building) => this.drawBuilding(building));
    this.buildingLayer.sort("depth");
  }

  private drawMap() {
    const terrain = this.add.graphics();
    const unlocked = this.state.district;
    const reserved = new Set(
      this.state.infrastructure.reserved_cells.map((cell) => `${cell.x}:${cell.y}`),
    );
    const roadColor = {
      dirt: 0xb89b6d,
      gravel: 0xaaa99f,
      stone: 0x8f948d,
    }[this.state.infrastructure.tier];

    for (let row = 0; row < GRID_SIZE; row += 1) {
      for (let column = 0; column < GRID_SIZE; column += 1) {
        const { x, y } = this.cellToWorld(column, row);
        const isUnlocked = column >= unlocked.min_x && column <= unlocked.max_x
          && row >= unlocked.min_y && row <= unlocked.max_y;
        const isRoad = reserved.has(`${column}:${row}`);
        const color = !isUnlocked
          ? 0x789b7e
          : isRoad
            ? roadColor
            : (row + column) % 3 === 0 ? 0x9fd47f : 0xaada89;
        terrain.fillStyle(color, isUnlocked ? 1 : 0.62);
        terrain.fillPoints(this.diamond(x, y), true);
        terrain.lineStyle(1, isUnlocked ? 0xffffff : 0x52715b, isUnlocked ? 0.16 : 0.25);
        terrain.strokePoints(this.diamond(x, y), true);

        if (isUnlocked && !isRoad && (row * 5 + column * 3) % 17 === 0) {
          const grass = this.add.image(x, y - 3, "grass-detail").setScale(1.15).setDepth(y - 2);
          this.mapLayer?.add(grass);
        }
      }
    }
    this.mapLayer?.addAt(terrain, 0);

    const label = this.add.text(0, 46, `${this.state.wallet.level_name} · ${this.state.infrastructure.tier} route`, {
      color: "#244b35",
      fontFamily: "Segoe UI, sans-serif",
      fontSize: "18px",
      fontStyle: "bold",
      backgroundColor: "#f8fbf2dd",
      padding: { x: 14, y: 8 },
    }).setOrigin(0.5).setDepth(10_000);
    this.mapLayer?.add(label);
  }

  private drawBuilding(building: PlacedBuilding) {
    const item = this.catalog.find((candidate) => candidate.id === building.catalog_item_id);
    if (!item) return;
    const position = this.buildingWorldPosition(item, building.grid_x, building.grid_y);
    const shadow = this.add.image(position.x + 3, position.y + 4, `shadow-${item.id}`);
    const sprite = this.add.image(position.x, position.y, `building-${item.id}`);
    this.applyPivot(sprite, item);
    this.applyPivot(shadow, item);
    shadow.setAlpha(0.45).setDepth(position.y - 1);
    sprite.setDepth(position.y).setInteractive({ useHandCursor: true });
    sprite.on("pointerup", (pointer: Phaser.Input.Pointer) => {
      if (pointer.getDistance() < 7 && !this.placement) {
        this.bridge.emit("buildingSelected", { buildingId: building.id });
      }
    });
    this.buildingLayer?.add([shadow, sprite]);
  }

  private startPlacement(detail: { catalogItemId: string; buildingId?: number }) {
    const existing = detail.buildingId == null
      ? undefined
      : this.state.buildings.find((building) => building.id === detail.buildingId);
    this.placement = {
      catalogItemId: detail.catalogItemId,
      buildingId: detail.buildingId,
      gridX: existing?.grid_x ?? this.state.district.min_x,
      gridY: existing?.grid_y ?? this.state.district.min_y,
      valid: false,
      reason: null,
    };
    this.refreshPreview();
  }

  private cancelPlacement() {
    this.placement = undefined;
    this.previewLayer?.destroy(true);
    this.previewLayer = undefined;
    this.bridge.emit("placementChanged", { active: false, valid: false, reason: null });
  }

  private updatePlacement(pointer: Phaser.Input.Pointer) {
    if (!this.placement) return;
    const world = pointer.positionToCamera(this.cameras.main) as Phaser.Math.Vector2;
    const cell = this.worldToCell(world.x, world.y);
    this.placement.gridX = Phaser.Math.Clamp(cell.x, 0, GRID_SIZE - 1);
    this.placement.gridY = Phaser.Math.Clamp(cell.y, 0, GRID_SIZE - 1);
    this.refreshPreview();
  }

  private refreshPreview() {
    if (!this.placement) return;
    const item = this.catalog.find((candidate) => candidate.id === this.placement?.catalogItemId);
    if (!item) return;
    const result = this.validatePreview(item, this.placement.gridX, this.placement.gridY);
    this.placement.valid = result.valid;
    this.placement.reason = result.reason;
    this.previewLayer?.destroy(true);
    this.previewLayer = this.add.container(0, 0).setDepth(20_000);

    const footprint = this.add.graphics();
    for (let x = this.placement.gridX; x < this.placement.gridX + item.footprint.width; x += 1) {
      for (let y = this.placement.gridY; y < this.placement.gridY + item.footprint.height; y += 1) {
        const position = this.cellToWorld(x, y);
        footprint.fillStyle(result.valid ? 0x5aa66a : 0xc45d54, 0.52);
        footprint.fillPoints(this.diamond(position.x, position.y), true);
        footprint.lineStyle(2, result.valid ? 0xdff4c9 : 0xffdad5, 0.9);
        footprint.strokePoints(this.diamond(position.x, position.y), true);
      }
    }
    const buildingPosition = this.buildingWorldPosition(
      item,
      this.placement.gridX,
      this.placement.gridY,
    );
    const ghost = this.add.image(buildingPosition.x, buildingPosition.y, `building-${item.id}`);
    this.applyPivot(ghost, item);
    ghost.setAlpha(0.7).setTint(result.valid ? 0xbff5ba : 0xffaaa3);
    this.previewLayer.add([footprint, ghost]);
    this.bridge.emit("placementChanged", {
      active: true,
      valid: result.valid,
      reason: result.reason,
    });
  }

  private validatePreview(item: TownCatalogItem, gridX: number, gridY: number) {
    const cells = new Set<string>();
    for (let x = gridX; x < gridX + item.footprint.width; x += 1) {
      for (let y = gridY; y < gridY + item.footprint.height; y += 1) cells.add(`${x}:${y}`);
    }
    const district = this.state.district;
    if ([...cells].some((key) => {
      const [x, y] = key.split(":").map(Number);
      return x < district.min_x || x > district.max_x || y < district.min_y || y > district.max_y;
    })) return { valid: false, reason: "Outside the unlocked district" };

    const reserved = new Set(
      this.state.infrastructure.reserved_cells.map((cell) => `${cell.x}:${cell.y}`),
    );
    if ([...cells].some((cell) => reserved.has(cell))) {
      return { valid: false, reason: "The town route must remain clear" };
    }
    const occupied = new Set<string>();
    this.state.buildings.forEach((building) => {
      if (building.id === this.placement?.buildingId) return;
      const placedItem = this.catalog.find((candidate) => candidate.id === building.catalog_item_id);
      if (!placedItem) return;
      for (let x = building.grid_x; x < building.grid_x + placedItem.footprint.width; x += 1) {
        for (let y = building.grid_y; y < building.grid_y + placedItem.footprint.height; y += 1) {
          occupied.add(`${x}:${y}`);
        }
      }
    });
    if ([...cells].some((cell) => occupied.has(cell))) {
      return { valid: false, reason: "Another building occupies that space" };
    }
    return { valid: true, reason: null };
  }

  private configureCamera() {
    const camera = this.cameras.main;
    camera.setBounds(-1200, -760, 2400, 1520);
    camera.centerOn(0, -10);
    camera.setZoom(0.9);
    this.bridge.emit("cameraChanged", { zoom: camera.zoom });
  }

  private configureInput() {
    this.input.on("pointerdown", (pointer: Phaser.Input.Pointer) => {
      if (this.placement) {
        this.updatePlacement(pointer);
        return;
      }
      this.isDragging = true;
      this.dragStart.set(pointer.x, pointer.y);
      this.cameraStart.set(this.cameras.main.scrollX, this.cameras.main.scrollY);
    });
    this.input.on("pointermove", (pointer: Phaser.Input.Pointer) => {
      if (this.placement) {
        this.updatePlacement(pointer);
        return;
      }
      if (!this.isDragging || !pointer.isDown) return;
      const camera = this.cameras.main;
      camera.scrollX = this.cameraStart.x - (pointer.x - this.dragStart.x) / camera.zoom;
      camera.scrollY = this.cameraStart.y - (pointer.y - this.dragStart.y) / camera.zoom;
    });
    this.input.on("pointerup", (pointer: Phaser.Input.Pointer) => {
      this.isDragging = false;
      if (!this.placement || !this.placement.valid || pointer.getDistance() > 7) return;
      this.bridge.emit("placementConfirmed", {
        catalogItemId: this.placement.catalogItemId,
        buildingId: this.placement.buildingId,
        gridX: this.placement.gridX,
        gridY: this.placement.gridY,
      });
    });
    this.input.on("pointerupoutside", () => { this.isDragging = false; });
    this.input.on("wheel", (_pointer: Phaser.Input.Pointer, _objects: Phaser.GameObjects.GameObject[], _deltaX: number, deltaY: number) => {
      const camera = this.cameras.main;
      camera.setZoom(Phaser.Math.Clamp(camera.zoom - deltaY * 0.001, 0.55, 1.45));
      this.bridge.emit("cameraChanged", { zoom: camera.zoom });
    });
  }

  private cellToWorld(column: number, row: number) {
    return {
      x: (column - row) * (TILE_WIDTH / 2),
      y: MAP_TOP + (column + row) * (TILE_HEIGHT / 2),
    };
  }

  private worldToCell(x: number, y: number) {
    const horizontal = x / (TILE_WIDTH / 2);
    const vertical = (y - MAP_TOP) / (TILE_HEIGHT / 2);
    return {
      x: Math.round((vertical + horizontal) / 2),
      y: Math.round((vertical - horizontal) / 2),
    };
  }

  private buildingWorldPosition(item: TownCatalogItem, gridX: number, gridY: number) {
    return this.cellToWorld(
      gridX + (item.footprint.width - 1) / 2,
      gridY + (item.footprint.height - 1) / 2,
    );
  }

  private applyPivot(image: Phaser.GameObjects.Image, item: TownCatalogItem) {
    const source = image.texture.getSourceImage() as HTMLImageElement;
    image.setOrigin(item.pivot.x / source.width, item.pivot.y / source.height);
  }

  private diamond(x: number, y: number) {
    return [
      new Phaser.Math.Vector2(x, y - TILE_HEIGHT / 2),
      new Phaser.Math.Vector2(x + TILE_WIDTH / 2, y),
      new Phaser.Math.Vector2(x, y + TILE_HEIGHT / 2),
      new Phaser.Math.Vector2(x - TILE_WIDTH / 2, y),
    ];
  }
}
