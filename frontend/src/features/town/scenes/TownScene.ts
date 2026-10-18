import Phaser from "phaser";
import type { GameState, PlacedBuilding, TownCatalogItem } from "../../../api/types";
import {
  buildingDisplayWidth,
  buildingWorldPosition,
  gridToWorld,
  TOWN_GRID_CELL_HEIGHT,
  TOWN_GRID_CELL_WIDTH,
  TOWN_GRID_SIZE,
  TOWN_WORLD_HEIGHT,
  TOWN_WORLD_LEFT,
  TOWN_WORLD_TOP,
  TOWN_WORLD_WIDTH,
  validateTownPlacement,
  worldToGrid,
} from "../townGrid";
import type { TownBridge } from "../townBridge";

const MIN_CAMERA_ZOOM = 0.55;
const DEFAULT_CAMERA_ZOOM = 1.1;
const MAX_CAMERA_ZOOM = 1.45;
const GRASS_BACKGROUND_URL = "/smaller_grass_bg.png";

type PlacementMode = "click" | "catalog-drag" | "building-drag";

type Placement = {
  catalogItemId: string;
  buildingId?: number;
  gridX: number;
  gridY: number;
  valid: boolean;
  reason: string | null;
  mode: PlacementMode;
};

type BuildingDisplay = {
  sprite: Phaser.GameObjects.Image;
  shadow: Phaser.GameObjects.Image;
};

export class TownScene extends Phaser.Scene {
  private readonly bridge: TownBridge;
  private readonly catalog: TownCatalogItem[];
  private state: GameState;
  private isDraggingCamera = false;
  private placementPointerDown = false;
  private dragStart = new Phaser.Math.Vector2();
  private cameraStart = new Phaser.Math.Vector2();
  private mapLayer?: Phaser.GameObjects.Container;
  private buildingLayer?: Phaser.GameObjects.Container;
  private previewLayer?: Phaser.GameObjects.Container;
  private placement?: Placement;
  private buildingDisplays = new Map<number, BuildingDisplay>();
  private unsubscribers: Array<() => void> = [];

  constructor(bridge: TownBridge, catalog: TownCatalogItem[], state: GameState) {
    super("town");
    this.bridge = bridge;
    this.catalog = catalog;
    this.state = state;
  }

  preload() {
    this.load.image("grass-background", GRASS_BACKGROUND_URL);
    this.catalog.forEach((item) => {
      this.load.image(`building-${item.id}`, item.asset);
      this.load.image(`shadow-${item.id}`, item.shadow_asset);
    });
  }

  create() {
    this.cameras.main.setBackgroundColor("#55c73f");
    this.renderWorld();
    this.configureCamera();
    this.configureInput();
    this.unsubscribers = [
      this.bridge.subscribe("startPlacement", (detail) => {
        this.startPlacement(detail, "click");
      }),
      this.bridge.subscribe("catalogDragStarted", (detail) => {
        this.startPlacement(detail, "catalog-drag");
      }),
      this.bridge.subscribe("catalogDragMoved", (detail) => {
        if (this.placement?.catalogItemId !== detail.catalogItemId) return;
        this.updatePlacementAtScreen(detail.canvasX, detail.canvasY);
      }),
      this.bridge.subscribe("catalogDropped", (detail) => {
        if (this.placement?.catalogItemId !== detail.catalogItemId) return;
        this.updatePlacementAtScreen(detail.canvasX, detail.canvasY);
        this.confirmPlacement();
      }),
      this.bridge.subscribe("cancelPlacement", () => this.cancelPlacement()),
      this.bridge.subscribe("stateChanged", ({ state }) => {
        this.cancelPlacement();
        this.state = state;
        this.renderWorld();
      }),
    ];

    const handleResize = () => this.constrainCamera();
    this.scale.on(Phaser.Scale.Events.RESIZE, handleResize);
    const cleanup = () => {
      this.unsubscribers.forEach((unsubscribe) => unsubscribe());
      this.unsubscribers = [];
      this.scale.off(Phaser.Scale.Events.RESIZE, handleResize);
    };
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, cleanup);
    this.events.once(Phaser.Scenes.Events.DESTROY, cleanup);
  }

  private renderWorld() {
    this.mapLayer?.destroy(true);
    this.buildingLayer?.destroy(true);
    this.buildingDisplays.clear();
    this.mapLayer = this.add.container(0, 0).setDepth(-100_000);
    this.buildingLayer = this.add.container(0, 0);
    this.drawMap();
    this.state.buildings.forEach((building) => this.drawBuilding(building));
    this.buildingLayer.sort("depth");
  }

  private drawMap() {
    const background = this.add.image(0, 0, "grass-background")
      .setDisplaySize(TOWN_WORLD_WIDTH, TOWN_WORLD_HEIGHT)
      .setDepth(-100_000);
    const terrain = this.add.graphics();
    const district = this.state.district;
    const reserved = new Set(
      this.state.infrastructure.reserved_cells.map((cell) => `${cell.x}:${cell.y}`),
    );
    const roadColor = {
      dirt: 0x9b7348,
      gravel: 0xaaa99f,
      stone: 0x7d847f,
    }[this.state.infrastructure.tier];

    for (let row = 0; row < TOWN_GRID_SIZE; row += 1) {
      for (let column = 0; column < TOWN_GRID_SIZE; column += 1) {
        const { x, y } = gridToWorld(column, row);
        const isUnlocked = column >= district.min_x && column <= district.max_x
          && row >= district.min_y && row <= district.max_y;
        const isReserved = reserved.has(`${column}:${row}`);

        if (isReserved) {
          terrain.fillStyle(roadColor, 0.78);
          terrain.lineStyle(2, 0xf5e7c4, 0.5);
        } else if (isUnlocked) {
          terrain.fillStyle(0xd8f0a7, 0.13);
          terrain.lineStyle(2, 0xf3ffe2, 0.42);
        } else {
          terrain.fillStyle(0x183d28, 0.16);
          terrain.lineStyle(1, 0x173d27, 0.35);
        }
        terrain.fillPoints(this.diamond(x, y), true);
        terrain.strokePoints(this.diamond(x, y), true);
      }
    }
    this.mapLayer?.add([background, terrain]);
  }

  private drawBuilding(building: PlacedBuilding) {
    const item = this.catalog.find((candidate) => candidate.id === building.catalog_item_id);
    if (!item) return;
    const position = buildingWorldPosition(item, building.grid_x, building.grid_y);
    const shadow = this.add.image(position.x + 5, position.y + 8, `shadow-${item.id}`);
    const sprite = this.add.image(position.x, position.y, `building-${item.id}`);
    this.applyPresentation(shadow, item);
    this.applyPresentation(sprite, item);
    shadow.setAlpha(0.4).setDepth(position.y - 1);
    sprite
      .setDepth(position.y)
      .setInteractive({ useHandCursor: true })
      .setData("isPlacedBuilding", true)
      .setData("buildingId", building.id);
    this.input.setDraggable(sprite);
    sprite.on("pointerup", (pointer: Phaser.Input.Pointer) => {
      if (pointer.getDistance() < 7 && !this.placement) {
        this.bridge.emit("buildingSelected", { buildingId: building.id });
      }
    });
    this.buildingDisplays.set(building.id, { sprite, shadow });
    this.buildingLayer?.add([shadow, sprite]);
  }

  private startPlacement(
    detail: { catalogItemId: string; buildingId?: number },
    mode: PlacementMode,
  ) {
    const item = this.catalog.find((candidate) => candidate.id === detail.catalogItemId);
    if (!item) return;
    const existing = detail.buildingId == null
      ? undefined
      : this.state.buildings.find((building) => building.id === detail.buildingId);
    this.cancelPlacement(false);
    this.placementPointerDown = false;
    this.placement = {
      catalogItemId: detail.catalogItemId,
      buildingId: detail.buildingId,
      gridX: existing?.grid_x ?? this.state.district.min_x,
      gridY: existing?.grid_y ?? this.state.district.min_y,
      valid: false,
      reason: null,
      mode,
    };
    if (detail.buildingId != null) this.setBuildingDimmed(detail.buildingId, true);
    this.refreshPreview();
  }

  private cancelPlacement(emitChange = true) {
    if (this.placement?.buildingId != null) {
      this.setBuildingDimmed(this.placement.buildingId, false);
    }
    this.placement = undefined;
    this.placementPointerDown = false;
    this.previewLayer?.destroy(true);
    this.previewLayer = undefined;
    if (emitChange) {
      this.bridge.emit("placementChanged", { active: false, valid: false, reason: null });
    }
  }

  private setBuildingDimmed(buildingId: number, dimmed: boolean) {
    const display = this.buildingDisplays.get(buildingId);
    if (!display) return;
    display.sprite.setAlpha(dimmed ? 0.22 : 1);
    display.shadow.setAlpha(dimmed ? 0.1 : 0.4);
  }

  private updatePlacementAtScreen(canvasX: number, canvasY: number) {
    const world = this.cameras.main.getWorldPoint(canvasX, canvasY);
    this.updatePlacementAtWorld(world.x, world.y);
  }

  private updatePlacementAtPointer(pointer: Phaser.Input.Pointer) {
    const world = pointer.positionToCamera(this.cameras.main) as Phaser.Math.Vector2;
    this.updatePlacementAtWorld(world.x, world.y);
  }

  private updatePlacementAtWorld(worldX: number, worldY: number) {
    if (!this.placement) return;
    const cell = worldToGrid(worldX, worldY);
    this.placement.gridX = cell.x;
    this.placement.gridY = cell.y;
    this.refreshPreview();
  }

  private refreshPreview() {
    if (!this.placement) return;
    const item = this.catalog.find((candidate) => candidate.id === this.placement?.catalogItemId);
    if (!item) return;
    const result = validateTownPlacement(
      this.state,
      this.catalog,
      item,
      this.placement.gridX,
      this.placement.gridY,
      this.placement.buildingId,
    );
    this.placement.valid = result.valid;
    this.placement.reason = result.reason;
    this.previewLayer?.destroy(true);
    this.previewLayer = this.add.container(0, 0).setDepth(100_000);

    const footprint = this.add.graphics();
    for (let x = this.placement.gridX; x < this.placement.gridX + item.footprint.width; x += 1) {
      for (let y = this.placement.gridY; y < this.placement.gridY + item.footprint.height; y += 1) {
        const position = gridToWorld(x, y);
        footprint.fillStyle(result.valid ? 0x4fa55d : 0xc4483d, 0.58);
        footprint.fillPoints(this.diamond(position.x, position.y), true);
        footprint.lineStyle(3, result.valid ? 0xe9ffd5 : 0xffd3cb, 0.96);
        footprint.strokePoints(this.diamond(position.x, position.y), true);
      }
    }
    const position = buildingWorldPosition(
      item,
      this.placement.gridX,
      this.placement.gridY,
    );
    const ghost = this.add.image(position.x, position.y, `building-${item.id}`);
    this.applyPresentation(ghost, item);
    ghost.setAlpha(0.72).setTint(result.valid ? 0xd8ffe0 : 0xffb4aa);
    this.previewLayer.add([footprint, ghost]);
    this.bridge.emit("placementChanged", {
      active: true,
      valid: result.valid,
      reason: result.reason,
    });
  }

  private confirmPlacement() {
    if (!this.placement || !this.placement.valid) return;
    this.bridge.emit("placementConfirmed", {
      catalogItemId: this.placement.catalogItemId,
      buildingId: this.placement.buildingId,
      gridX: this.placement.gridX,
      gridY: this.placement.gridY,
    });
  }

  private configureCamera() {
    const camera = this.cameras.main;
    camera.setBounds(TOWN_WORLD_LEFT, TOWN_WORLD_TOP, TOWN_WORLD_WIDTH, TOWN_WORLD_HEIGHT);
    camera.centerOn(0, 0);
    camera.setZoom(Math.max(DEFAULT_CAMERA_ZOOM, this.getMinimumZoom()));
    camera.roundPixels = true;
    this.constrainCamera();
  }

  private getMinimumZoom() {
    return Math.max(
      MIN_CAMERA_ZOOM,
      this.scale.width / TOWN_WORLD_WIDTH,
      this.scale.height / TOWN_WORLD_HEIGHT,
    );
  }

  private constrainCamera() {
    const camera = this.cameras.main;
    const minimumZoom = this.getMinimumZoom();
    if (camera.zoom < minimumZoom) camera.setZoom(minimumZoom);
    camera.scrollX = camera.clampX(camera.scrollX);
    camera.scrollY = camera.clampY(camera.scrollY);
    this.bridge.emit("cameraChanged", { zoom: camera.zoom });
  }

  private configureInput() {
    // Keep a click available for selection; Phaser otherwise starts dragging on pointerdown.
    this.input.dragDistanceThreshold = 7;
    this.input.keyboard?.on("keydown-ESC", () => this.cancelPlacement());
    this.input.on("pointerdown", (
      pointer: Phaser.Input.Pointer,
      gameObjects: Phaser.GameObjects.GameObject[],
    ) => {
      if (this.placement) {
        if (this.placement.mode === "click") {
          this.placementPointerDown = true;
          this.updatePlacementAtPointer(pointer);
        }
        return;
      }
      if (gameObjects.some((gameObject) => gameObject.getData("isPlacedBuilding"))) return;
      this.isDraggingCamera = true;
      this.dragStart.set(pointer.x, pointer.y);
      this.cameraStart.set(this.cameras.main.scrollX, this.cameras.main.scrollY);
    });
    this.input.on("pointermove", (pointer: Phaser.Input.Pointer) => {
      if (this.placement?.mode === "click") {
        this.updatePlacementAtPointer(pointer);
        return;
      }
      if (!this.isDraggingCamera || !pointer.isDown) return;
      const camera = this.cameras.main;
      camera.scrollX = camera.clampX(
        this.cameraStart.x - (pointer.x - this.dragStart.x) / camera.zoom,
      );
      camera.scrollY = camera.clampY(
        this.cameraStart.y - (pointer.y - this.dragStart.y) / camera.zoom,
      );
    });
    this.input.on("pointerup", (pointer: Phaser.Input.Pointer) => {
      this.isDraggingCamera = false;
      const shouldConfirm = this.placement?.mode === "click"
        && this.placementPointerDown
        && pointer.getDistance() < 7;
      this.placementPointerDown = false;
      if (shouldConfirm) {
        this.confirmPlacement();
      }
    });
    this.input.on("pointerupoutside", () => {
      this.isDraggingCamera = false;
      this.placementPointerDown = false;
    });
    this.input.on("dragstart", (
      _pointer: Phaser.Input.Pointer,
      gameObject: Phaser.GameObjects.Image,
    ) => {
      if (this.placement) return;
      const buildingId = gameObject.getData("buildingId") as number | undefined;
      const building = this.state.buildings.find((candidate) => candidate.id === buildingId);
      if (!building) return;
      this.startPlacement({
        catalogItemId: building.catalog_item_id,
        buildingId: building.id,
      }, "building-drag");
    });
    this.input.on("drag", (
      _pointer: Phaser.Input.Pointer,
      gameObject: Phaser.GameObjects.Image,
      dragX: number,
      dragY: number,
    ) => {
      if (gameObject.getData("buildingId") !== this.placement?.buildingId) return;
      this.updatePlacementAtWorld(dragX, dragY);
    });
    this.input.on("dragend", (
      _pointer: Phaser.Input.Pointer,
      gameObject: Phaser.GameObjects.Image,
    ) => {
      const placement = this.placement;
      if (!placement || gameObject.getData("buildingId") !== placement.buildingId) return;
      if (placement.valid) this.confirmPlacement();
      else this.cancelPlacement();
    });
    this.input.on("wheel", (
      _pointer: Phaser.Input.Pointer,
      _objects: Phaser.GameObjects.GameObject[],
      _deltaX: number,
      deltaY: number,
    ) => {
      const camera = this.cameras.main;
      const minimumZoom = this.getMinimumZoom();
      const maximumZoom = Math.max(MAX_CAMERA_ZOOM, minimumZoom);
      camera.setZoom(Phaser.Math.Clamp(
        camera.zoom - deltaY * 0.001,
        minimumZoom,
        maximumZoom,
      ));
      this.constrainCamera();
    });
  }

  private applyPresentation(image: Phaser.GameObjects.Image, item: TownCatalogItem) {
    image.setOrigin(item.pivot.x / image.width, item.pivot.y / image.height);
    image.setScale(buildingDisplayWidth(item) / image.width);
  }

  private diamond(x: number, y: number) {
    return [
      new Phaser.Math.Vector2(x, y - TOWN_GRID_CELL_HEIGHT / 2),
      new Phaser.Math.Vector2(x + TOWN_GRID_CELL_WIDTH / 2, y),
      new Phaser.Math.Vector2(x, y + TOWN_GRID_CELL_HEIGHT / 2),
      new Phaser.Math.Vector2(x - TOWN_GRID_CELL_WIDTH / 2, y),
    ];
  }
}
