import Phaser from "phaser";
import type { GameState, PlacedBuilding, TownCatalogItem } from "../../../api/types";
import {
  buildingDisplayWidth,
  buildingGridPosition,
  buildingWorldPosition,
  gridToWorld,
  shouldShowPlacementGrid,
  TOWN_GRID_CELL_HEIGHT,
  TOWN_GRID_CELL_WIDTH,
  TOWN_GRID_COLUMNS,
  TOWN_GRID_ROWS,
  TOWN_WORLD_HEIGHT,
  TOWN_WORLD_LEFT,
  TOWN_WORLD_TOP,
  TOWN_WORLD_WIDTH,
  validateTownPlacement,
  worldToGrid,
  type TownPlacementMode,
} from "../townGrid";
import type { TownBridge } from "../townBridge";
import { generatePerimeterTrees } from "../perimeterTrees";
import {
  AMBIENT_CHARACTER_VARIANTS,
  characterAnimationFrames,
  characterAnimationKey,
  characterAssetUrl,
  characterDirection,
  characterTextureKey,
  createResidentAssignments,
  type AmbientCharacterVariant,
} from "../objects/ambientCharacters";

const MIN_CAMERA_ZOOM = 0.4;
const MAX_CAMERA_ZOOM = 1.45;
const GRASS_BACKGROUND_URL = "/patches_bg.png";
const GROUND_TILE_OVERDRAW = 4;
const TREE_VARIANTS = [1, 2, 3, 4] as const;
const CHARACTER_FRAME_SIZE = 24;
const CHARACTER_SCALE = 3;
const CHARACTER_WALK_SPEED = 72;
const CHARACTER_HORIZONTAL_INSET = 420;
const CHARACTER_VERTICAL_INSET = 350;
const CHARACTER_HOME_OFFSET_Y = 18;
const CHARACTER_WANDER_RADIUS = 520;
const CHARACTER_MINIMUM_INDOOR_TIME = 3_000;
const CHARACTER_MAXIMUM_INDOOR_TIME = 10_000;

type Placement = {
  catalogItemId: string;
  buildingId?: number;
  gridX: number;
  gridY: number;
  valid: boolean;
  reason: string | null;
  mode: TownPlacementMode;
};

type BuildingDisplay = {
  sprite: Phaser.GameObjects.Image;
  shadow?: Phaser.GameObjects.Image;
};

type AmbientCharacter = {
  sprite: Phaser.GameObjects.Sprite;
  home: Phaser.Math.Vector2;
  target: Phaser.Math.Vector2;
  variant: AmbientCharacterVariant;
  speed: number;
  mode: "wandering" | "returning" | "inside";
  remainingStops: number;
  insideUntil: number;
};

export class TownScene extends Phaser.Scene {
  private readonly bridge: TownBridge;
  private readonly catalog: TownCatalogItem[];
  private state: GameState;
  private isDraggingCamera = false;
  private interactionLocked = false;
  private placementPointerDown = false;
  private emptyPointerDown = false;
  private dragStart = new Phaser.Math.Vector2();
  private cameraStart = new Phaser.Math.Vector2();
  private mapLayer?: Phaser.GameObjects.Container;
  private buildingLayer?: Phaser.GameObjects.Container;
  private placementGrid?: Phaser.GameObjects.Graphics;
  private previewLayer?: Phaser.GameObjects.Container;
  private placement?: Placement;
  private buildingDisplays = new Map<number, BuildingDisplay>();
  private ambientCharacters: AmbientCharacter[] = [];
  private unsubscribers: Array<() => void> = [];

  constructor(bridge: TownBridge, catalog: TownCatalogItem[], state: GameState) {
    super("town");
    this.bridge = bridge;
    this.catalog = catalog;
    this.state = state;
  }

  preload() {
    this.load.image("grass-background", GRASS_BACKGROUND_URL);
    TREE_VARIANTS.forEach((variant) => {
      this.load.image(`tree-${variant}`, `/tree${variant}.png`);
    });
    AMBIENT_CHARACTER_VARIANTS.forEach((variant) => {
      this.load.spritesheet(characterTextureKey(variant), characterAssetUrl(variant), {
        frameWidth: CHARACTER_FRAME_SIZE,
        frameHeight: CHARACTER_FRAME_SIZE,
      });
    });
    this.catalog.forEach((item) => {
      this.load.image(`building-${item.id}`, item.asset);
      if (item.shadow_asset) {
        this.load.image(`shadow-${item.id}`, item.shadow_asset);
      }
    });
  }

  create() {
    this.cameras.main.setBackgroundColor("#55c73f");
    this.renderWorld();
    this.configureCamera();
    this.configureInput();
    this.unsubscribers = [
      this.bridge.subscribe("interactionLocked", ({ locked }) => {
        this.interactionLocked = locked;
        if (locked) this.cancelPlacement();
      }),
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
    this.ambientCharacters = [];
    this.mapLayer = this.add.container(0, 0).setDepth(-100_000);
    this.buildingLayer = this.add.container(0, 0);
    this.drawMap();
    this.state.buildings.forEach((building) => this.drawBuilding(building));
    this.createCharacterAnimations();
    this.spawnAmbientCharacters();
    this.buildingLayer.sort("depth");
  }

  update(time: number, delta: number) {
    if (this.ambientCharacters.length === 0) return;
    const elapsedSeconds = Math.min(delta, 50) / 1_000;
    this.ambientCharacters.forEach((character) => {
      if (character.mode === "inside") {
        if (time >= character.insideUntil) this.releaseCharacter(character);
        return;
      }
      const deltaX = character.target.x - character.sprite.x;
      const deltaY = character.target.y - character.sprite.y;
      const distance = Math.hypot(deltaX, deltaY);
      const step = character.speed * elapsedSeconds;
      if (distance <= step) {
        character.sprite.setPosition(character.target.x, character.target.y);
        if (character.mode === "returning") {
          this.sendCharacterInside(character, time);
          return;
        }
        character.remainingStops -= 1;
        if (character.remainingStops <= 0) this.sendCharacterHome(character);
        else this.assignCharacterTarget(character);
      } else {
        character.sprite.x += deltaX / distance * step;
        character.sprite.y += deltaY / distance * step;
      }
      character.sprite.setDepth(character.sprite.y);
    });
    this.buildingLayer?.sort("depth");
  }

  private drawMap() {
    const background = this.add.image(0, 0, "grass-background")
      .setDisplaySize(TOWN_WORLD_WIDTH, TOWN_WORLD_HEIGHT)
      .setDepth(-100_000);
    const trees = generatePerimeterTrees(TOWN_WORLD_WIDTH, TOWN_WORLD_HEIGHT).map((tree) => (
      this.add.image(tree.x, tree.y, `tree-${tree.variant}`)
        .setScale(tree.scale)
        .setFlipX(tree.flipX)
        .setDepth(tree.y)
    ));
    this.mapLayer?.add([background, ...trees]);
    this.mapLayer?.sort("depth");
  }

  private createCharacterAnimations() {
    AMBIENT_CHARACTER_VARIANTS.forEach((variant) => {
      (["down", "left", "right", "up"] as const).forEach((direction) => {
        const key = characterAnimationKey(variant, direction);
        if (this.anims.exists(key)) return;
        this.anims.create({
          key,
          frames: this.anims.generateFrameNumbers(
            characterTextureKey(variant),
            characterAnimationFrames(direction),
          ),
          frameRate: 7,
          repeat: -1,
        });
      });
    });
  }

  private spawnAmbientCharacters() {
    const assignments = createResidentAssignments(this.state, this.catalog);
    assignments.forEach((assignment, index) => {
      const building = this.state.buildings.find(({ id }) => id === assignment.buildingId);
      const item = this.catalog.find(({ id }) => id === assignment.catalogItemId);
      if (!building || !item) return;
      const buildingPosition = buildingWorldPosition(item, building.grid_x, building.grid_y);
      const home = new Phaser.Math.Vector2(
        buildingPosition.x,
        buildingPosition.y + CHARACTER_HOME_OFFSET_Y,
      );
      const sprite = this.add.sprite(
        home.x + (index % 2 === 0 ? -12 : 12),
        home.y + 12,
        characterTextureKey(assignment.variant),
        0,
      )
        .setOrigin(0.5, 0.78)
        .setScale(CHARACTER_SCALE);
      const character: AmbientCharacter = {
        sprite,
        home,
        target: new Phaser.Math.Vector2(sprite.x, sprite.y),
        variant: assignment.variant,
        speed: CHARACTER_WALK_SPEED + index % 6 * 3,
        mode: "wandering",
        remainingStops: Phaser.Math.Between(1, 3),
        insideUntil: 0,
      };
      this.assignCharacterTarget(character);
      this.ambientCharacters.push(character);
      this.buildingLayer?.add(sprite);
    });
  }

  private assignCharacterTarget(character: AmbientCharacter) {
    const targetX = Phaser.Math.Clamp(
      character.home.x + Phaser.Math.FloatBetween(-CHARACTER_WANDER_RADIUS, CHARACTER_WANDER_RADIUS),
      TOWN_WORLD_LEFT + CHARACTER_HORIZONTAL_INSET,
      TOWN_WORLD_LEFT + TOWN_WORLD_WIDTH - CHARACTER_HORIZONTAL_INSET,
    );
    const targetY = Phaser.Math.Clamp(
      character.home.y + Phaser.Math.FloatBetween(-CHARACTER_WANDER_RADIUS, CHARACTER_WANDER_RADIUS),
      TOWN_WORLD_TOP + CHARACTER_VERTICAL_INSET,
      TOWN_WORLD_TOP + TOWN_WORLD_HEIGHT - CHARACTER_VERTICAL_INSET,
    );
    character.mode = "wandering";
    character.target.set(targetX, targetY);
    this.playCharacterDirection(character);
  }

  private sendCharacterHome(character: AmbientCharacter) {
    character.mode = "returning";
    character.target.copy(character.home);
    this.playCharacterDirection(character);
  }

  private sendCharacterInside(character: AmbientCharacter, time: number) {
    character.mode = "inside";
    character.insideUntil = time + Phaser.Math.Between(
      CHARACTER_MINIMUM_INDOOR_TIME,
      CHARACTER_MAXIMUM_INDOOR_TIME,
    );
    character.sprite.anims.stop();
    character.sprite.setVisible(false);
  }

  private releaseCharacter(character: AmbientCharacter) {
    character.sprite.setPosition(character.home.x, character.home.y + 12).setVisible(true);
    character.remainingStops = Phaser.Math.Between(1, 3);
    this.assignCharacterTarget(character);
  }

  private playCharacterDirection(character: AmbientCharacter) {
    const direction = characterDirection(
      character.target.x - character.sprite.x,
      character.target.y - character.sprite.y,
    );
    character.sprite.play(characterAnimationKey(character.variant, direction), true);
  }

  private drawBuilding(building: PlacedBuilding) {
    const item = this.catalog.find((candidate) => candidate.id === building.catalog_item_id);
    if (!item) return;
    const position = buildingWorldPosition(item, building.grid_x, building.grid_y);
    const shadow = item.shadow_asset
      ? this.add.image(position.x + 5, position.y + 8, `shadow-${item.id}`)
      : undefined;
    const sprite = this.add.image(position.x, position.y, `building-${item.id}`);
    if (shadow) {
      this.applyPresentation(shadow, item);
      shadow.setAlpha(0.4).setDepth(position.y - 1);
    }
    this.applyPresentation(sprite, item);
    sprite
      .setDepth(item.render_kind === "ground" ? -50_000 + position.y : position.y)
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
    this.buildingLayer?.add(shadow ? [shadow, sprite] : sprite);
  }

  private startPlacement(
    detail: { catalogItemId: string; buildingId?: number },
    mode: TownPlacementMode,
  ) {
    if (this.interactionLocked) return;
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
      gridX: existing?.grid_x ?? Math.floor((TOWN_GRID_COLUMNS - item.footprint.width) / 2),
      gridY: existing?.grid_y ?? Math.floor((TOWN_GRID_ROWS - item.footprint.height) / 2),
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
    this.placementGrid?.destroy();
    this.placementGrid = undefined;
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
    display.shadow?.setAlpha(dimmed ? 0.1 : 0.4);
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
    if (shouldShowPlacementGrid(this.placement.mode) && !this.placementGrid) {
      const grid = this.add.graphics();
      grid.lineStyle(2, 0x143f26, 0.72);
      for (let row = 0; row < TOWN_GRID_ROWS; row += 1) {
        for (let column = 0; column < TOWN_GRID_COLUMNS; column += 1) {
          const position = gridToWorld(column, row);
          grid.strokePoints(this.diamond(position.x, position.y), true);
        }
      }
      this.placementGrid = grid.setDepth(99_999);
    }

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
    if (this.interactionLocked || !this.placement || !this.placement.valid) return;
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
    camera.setZoom(this.getMinimumZoom());
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
        this.emptyPointerDown = false;
        if (this.placement.mode === "click") {
          this.placementPointerDown = true;
          this.updatePlacementAtPointer(pointer);
        }
        return;
      }
      if (gameObjects.some((gameObject) => gameObject.getData("isPlacedBuilding"))) {
        this.emptyPointerDown = false;
        return;
      }
      this.emptyPointerDown = true;
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
      const shouldDeselect = this.emptyPointerDown && pointer.getDistance() < 7;
      const shouldConfirm = this.placement?.mode === "click"
        && this.placementPointerDown
        && pointer.getDistance() < 7;
      this.emptyPointerDown = false;
      this.placementPointerDown = false;
      if (shouldDeselect) {
        this.bridge.emit("buildingDeselected", {});
      }
      if (shouldConfirm) {
        this.confirmPlacement();
      }
    });
    this.input.on("pointerupoutside", () => {
      this.isDraggingCamera = false;
      this.emptyPointerDown = false;
      this.placementPointerDown = false;
      if (this.placement?.mode === "building-drag") this.cancelPlacement();
    });
    this.input.on("dragstart", (
      _pointer: Phaser.Input.Pointer,
      gameObject: Phaser.GameObjects.Image,
    ) => {
      if (this.interactionLocked || this.placement) return;
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
      if (this.placement?.mode !== "building-drag"
        || gameObject.getData("buildingId") !== this.placement.buildingId) return;
      const item = this.catalog.find((candidate) => candidate.id === this.placement?.catalogItemId);
      if (!item) return;
      const cell = buildingGridPosition(item, dragX, dragY);
      this.placement.gridX = cell.x;
      this.placement.gridY = cell.y;
      this.refreshPreview();
    });
    this.input.on("dragend", (
      pointer: Phaser.Input.Pointer,
      gameObject: Phaser.GameObjects.Image,
    ) => {
      const placement = this.placement;
      if (placement?.mode !== "building-drag" || gameObject.getData("buildingId") !== placement.buildingId) return;
      const insideCanvas = pointer.x >= 0 && pointer.y >= 0
        && pointer.x < this.scale.width && pointer.y < this.scale.height
        && pointer.event.target === this.game.canvas;
      if (insideCanvas && placement.valid) this.confirmPlacement();
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
    if (item.render_kind === "ground") {
      image.setOrigin(0.5, 0.5);
      image.setDisplaySize(
        TOWN_GRID_CELL_WIDTH + GROUND_TILE_OVERDRAW,
        TOWN_GRID_CELL_HEIGHT + GROUND_TILE_OVERDRAW,
      );
      return;
    }
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
