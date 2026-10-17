import Phaser from "phaser";
import grassBackgroundUrl from "../../../../Assets/smaller_grass_bg.png";
import { buildingCatalog, getBuilding, type BuildingId } from "../catalog/buildingCatalog";
import type { TownBridge } from "../townBridge";

const WORLD_WIDTH = 2400;
const WORLD_HEIGHT = 1510;
const WORLD_LEFT = -WORLD_WIDTH / 2;
const WORLD_TOP = -WORLD_HEIGHT / 2;
const GRID_CELL_WIDTH = 96;
const GRID_CELL_HEIGHT = 48;
const GRID_ROW_STEP = GRID_CELL_HEIGHT / 2;
const MIN_CAMERA_ZOOM = 0.55;
const DEFAULT_CAMERA_ZOOM = 1.1;
const MAX_CAMERA_ZOOM = 1.45;

export class EmptyTownScene extends Phaser.Scene {
  private readonly bridge: TownBridge;
  private isDraggingCamera = false;
  private dragStart = new Phaser.Math.Vector2();
  private cameraStart = new Phaser.Math.Vector2();
  private placementGrid?: Phaser.GameObjects.Graphics;
  private placementTarget?: Phaser.GameObjects.Graphics;
  private placementPreview?: Phaser.GameObjects.Image;
  private activeBuildingId?: BuildingId;

  constructor(bridge: TownBridge) {
    super("empty-town");
    this.bridge = bridge;
  }

  preload() {
    this.load.image("grass-background", grassBackgroundUrl);
    buildingCatalog.forEach((building) => {
      this.load.image(building.textureKey, building.imageUrl);
    });
  }

  create() {
    this.createWorld();
    this.configureCamera();
    this.configureInput();

    const unsubscribeFromDragStart = this.bridge.subscribe("buildingDragStarted", ({ buildingId }) => {
      this.showPlacementGuide(buildingId);
    });
    const unsubscribeFromDragMove = this.bridge.subscribe("buildingDragMoved", ({ screenX, screenY }) => {
      this.movePlacementPreview(screenX, screenY);
    });
    const unsubscribeFromDragEnd = this.bridge.subscribe("buildingDragEnded", () => {
      this.hidePlacementGuide();
    });
    const unsubscribeFromDrops = this.bridge.subscribe("buildingDropped", (placement) => {
      this.placeBuilding(placement.buildingId, placement.screenX, placement.screenY);
    });
    const handleResize = () => this.constrainCamera();

    this.scale.on(Phaser.Scale.Events.RESIZE, handleResize);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      unsubscribeFromDragStart();
      unsubscribeFromDragMove();
      unsubscribeFromDragEnd();
      unsubscribeFromDrops();
      this.scale.off(Phaser.Scale.Events.RESIZE, handleResize);
    });
  }

  private createWorld() {
    this.add.image(0, 0, "grass-background")
      .setDisplaySize(WORLD_WIDTH, WORLD_HEIGHT)
      .setDepth(-100000);

    this.placementGrid = this.add.graphics()
      .setDepth(100000)
      .setVisible(false);
    this.placementGrid.lineStyle(2, 0x174d28, 0.7);

    const rowCount = Math.floor(WORLD_HEIGHT / GRID_ROW_STEP);
    for (let row = 1; row < rowCount; row += 1) {
      const y = WORLD_TOP + row * GRID_ROW_STEP;
      const offsetX = row % 2 === 0 ? 0 : GRID_CELL_WIDTH / 2;
      for (
        let x = WORLD_LEFT + GRID_CELL_WIDTH + offsetX;
        x < WORLD_LEFT + WORLD_WIDTH - GRID_CELL_WIDTH;
        x += GRID_CELL_WIDTH
      ) {
        this.placementGrid.strokePoints([
          new Phaser.Math.Vector2(x, y - GRID_CELL_HEIGHT / 2),
          new Phaser.Math.Vector2(x + GRID_CELL_WIDTH / 2, y),
          new Phaser.Math.Vector2(x, y + GRID_CELL_HEIGHT / 2),
          new Phaser.Math.Vector2(x - GRID_CELL_WIDTH / 2, y),
        ], true);
      }
    }

    const targetCell = [
      new Phaser.Math.Vector2(0, -GRID_CELL_HEIGHT / 2),
      new Phaser.Math.Vector2(GRID_CELL_WIDTH / 2, 0),
      new Phaser.Math.Vector2(0, GRID_CELL_HEIGHT / 2),
      new Phaser.Math.Vector2(-GRID_CELL_WIDTH / 2, 0),
    ];
    this.placementTarget = this.add.graphics()
      .setDepth(100000)
      .setVisible(false);
    this.placementTarget.fillStyle(0x174d28, 0.28);
    this.placementTarget.fillPoints(targetCell, true);
    this.placementTarget.lineStyle(3, 0x0d351c, 0.95);
    this.placementTarget.strokePoints(targetCell, true);
  }

  private showPlacementGuide(buildingId: BuildingId) {
    const catalogItem = getBuilding(buildingId);
    if (!catalogItem) return;

    this.activeBuildingId = buildingId;
    this.placementGrid?.setVisible(true);
    this.placementPreview?.destroy();
    this.placementPreview = this.add.image(0, 0, catalogItem.textureKey)
      .setOrigin(0.5, 0.85)
      .setAlpha(0.72)
      .setTint(0xd8ffe0)
      .setDepth(100001)
      .setVisible(false);
    this.scaleBuilding(this.placementPreview, catalogItem.worldWidth);
  }

  private movePlacementPreview(screenX: number, screenY: number) {
    if (!this.activeBuildingId || !this.placementPreview) return;

    const worldPosition = this.cameras.main.getWorldPoint(screenX, screenY);
    const snappedPosition = this.snapToGrid(worldPosition.x, worldPosition.y);
    this.placementTarget
      ?.setPosition(snappedPosition.x, snappedPosition.y)
      .setVisible(true);
    this.placementPreview
      .setPosition(snappedPosition.x, snappedPosition.y)
      .setVisible(true);
  }

  private hidePlacementGuide() {
    this.activeBuildingId = undefined;
    this.placementGrid?.setVisible(false);
    this.placementTarget?.setVisible(false);
    this.placementPreview?.destroy();
    this.placementPreview = undefined;
  }

  private placeBuilding(buildingId: BuildingId, screenX: number, screenY: number) {
    const catalogItem = getBuilding(buildingId);
    if (!catalogItem) return;

    const worldPosition = this.cameras.main.getWorldPoint(screenX, screenY);
    const snappedPosition = this.snapToGrid(worldPosition.x, worldPosition.y);
    const building = this.add.image(snappedPosition.x, snappedPosition.y, catalogItem.textureKey)
      .setOrigin(0.5, 0.85)
      .setInteractive({ useHandCursor: true });

    this.scaleBuilding(building, catalogItem.worldWidth);
    building.setDepth(Math.round(building.y));
    building.setData("isPlacedBuilding", true);
    this.input.setDraggable(building);
  }

  private scaleBuilding(building: Phaser.GameObjects.Image, worldWidth: number) {
    building.setScale(worldWidth / building.width);
  }

  private snapToGrid(x: number, y: number) {
    const maxRow = Math.floor(WORLD_HEIGHT / GRID_ROW_STEP) - 1;
    const row = Phaser.Math.Clamp(
      Math.round((y - WORLD_TOP) / GRID_ROW_STEP),
      1,
      maxRow,
    );
    const offsetX = row % 2 === 0 ? 0 : GRID_CELL_WIDTH / 2;
    const maxColumn = Math.floor((WORLD_WIDTH - offsetX) / GRID_CELL_WIDTH) - 1;
    const column = Phaser.Math.Clamp(
      Math.round((x - WORLD_LEFT - offsetX) / GRID_CELL_WIDTH),
      1,
      maxColumn,
    );

    return new Phaser.Math.Vector2(
      WORLD_LEFT + offsetX + column * GRID_CELL_WIDTH,
      WORLD_TOP + row * GRID_ROW_STEP,
    );
  }

  private configureCamera() {
    const camera = this.cameras.main;
    camera.setBounds(WORLD_LEFT, WORLD_TOP, WORLD_WIDTH, WORLD_HEIGHT);
    camera.centerOn(0, 0);
    camera.setZoom(Math.max(DEFAULT_CAMERA_ZOOM, this.getMinimumZoom()));
    camera.roundPixels = true;
    this.constrainCamera();
  }

  private getMinimumZoom() {
    return Math.max(
      MIN_CAMERA_ZOOM,
      this.scale.width / WORLD_WIDTH,
      this.scale.height / WORLD_HEIGHT,
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
    this.input.on("pointerdown", (
      pointer: Phaser.Input.Pointer,
      gameObjects: Phaser.GameObjects.GameObject[],
    ) => {
      if (gameObjects.some((gameObject) => gameObject.getData("isPlacedBuilding"))) return;

      this.isDraggingCamera = true;
      this.dragStart.set(pointer.x, pointer.y);
      this.cameraStart.set(this.cameras.main.scrollX, this.cameras.main.scrollY);
    });

    this.input.on("pointermove", (pointer: Phaser.Input.Pointer) => {
      if (!this.isDraggingCamera || !pointer.isDown) return;
      const camera = this.cameras.main;
      camera.scrollX = camera.clampX(
        this.cameraStart.x - (pointer.x - this.dragStart.x) / camera.zoom,
      );
      camera.scrollY = camera.clampY(
        this.cameraStart.y - (pointer.y - this.dragStart.y) / camera.zoom,
      );
    });

    this.input.on("dragstart", (
      _pointer: Phaser.Input.Pointer,
      gameObject: Phaser.GameObjects.Image,
    ) => {
      if (!gameObject.getData("isPlacedBuilding")) return;

      this.placementGrid?.setVisible(true);
      this.placementTarget
        ?.setPosition(gameObject.x, gameObject.y)
        .setVisible(true);
    });

    this.input.on("drag", (
      _pointer: Phaser.Input.Pointer,
      gameObject: Phaser.GameObjects.Image,
      dragX: number,
      dragY: number,
    ) => {
      const snappedPosition = this.snapToGrid(dragX, dragY);
      gameObject.setPosition(snappedPosition.x, snappedPosition.y);
      gameObject.setDepth(Math.round(snappedPosition.y));
      this.placementTarget?.setPosition(snappedPosition.x, snappedPosition.y);
    });

    this.input.on("dragend", () => {
      this.placementGrid?.setVisible(false);
      this.placementTarget?.setVisible(false);
    });
    this.input.on("pointerup", () => { this.isDraggingCamera = false; });
    this.input.on("pointerupoutside", () => { this.isDraggingCamera = false; });
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
}
