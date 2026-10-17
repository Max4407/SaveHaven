import Phaser from "phaser";
import grassDetailUrl from "../../../../Assets/free_grass/1.png";
import type { TownBridge } from "../townBridge";

const GRID_SIZE = 16;
const TILE_WIDTH = 68;
const TILE_HEIGHT = 34;

export class EmptyTownScene extends Phaser.Scene {
  private readonly bridge: TownBridge;
  private isDragging = false;
  private dragStart = new Phaser.Math.Vector2();
  private cameraStart = new Phaser.Math.Vector2();

  constructor(bridge: TownBridge) {
    super("empty-town");
    this.bridge = bridge;
  }

  preload() {
    this.load.image("grass-detail", grassDetailUrl);
  }

  create() {
    this.cameras.main.setBackgroundColor("#c9e4dd");
    this.drawMap();
    this.configureCamera();
    this.configureInput();
  }

  private drawMap() {
    const centerX = 0;
    const topY = -260;
    const terrain = this.add.graphics();

    for (let row = 0; row < GRID_SIZE; row += 1) {
      for (let column = 0; column < GRID_SIZE; column += 1) {
        const x = centerX + (column - row) * (TILE_WIDTH / 2);
        const y = topY + (column + row) * (TILE_HEIGHT / 2);
        const shade = (row + column) % 3 === 0 ? 0x9fd47f : 0xaada89;
        terrain.fillStyle(shade, 1);
        terrain.fillPoints([
          new Phaser.Geom.Point(x, y - TILE_HEIGHT / 2),
          new Phaser.Geom.Point(x + TILE_WIDTH / 2, y),
          new Phaser.Geom.Point(x, y + TILE_HEIGHT / 2),
          new Phaser.Geom.Point(x - TILE_WIDTH / 2, y),
        ], true);

        if ((row * 5 + column * 3) % 17 === 0) {
          this.add.image(x, y - 3, "grass-detail").setScale(1.15).setDepth(y + 1);
        }
      }
    }
    terrain.setDepth(-1000);

    const grid = this.add.graphics();
    grid.lineStyle(2, 0xffffff, 0.2);
    for (let index = 0; index <= GRID_SIZE; index += 1) {
      const leftX = centerX - index * (TILE_WIDTH / 2);
      const leftY = topY + index * (TILE_HEIGHT / 2);
      const rightX = centerX + (GRID_SIZE - index) * (TILE_WIDTH / 2);
      const rightY = topY + (GRID_SIZE + index) * (TILE_HEIGHT / 2);
      grid.lineBetween(leftX, leftY, rightX, rightY);

      const topX = centerX + index * (TILE_WIDTH / 2);
      const topLineY = topY + index * (TILE_HEIGHT / 2);
      const bottomX = centerX + (index - GRID_SIZE) * (TILE_WIDTH / 2);
      const bottomY = topY + (GRID_SIZE + index) * (TILE_HEIGHT / 2);
      grid.lineBetween(topX, topLineY, bottomX, bottomY);
    }
    grid.setDepth(1000);

    this.add.text(0, 48, "Your haven starts here", {
      color: "#244b35",
      fontFamily: "Segoe UI, sans-serif",
      fontSize: "22px",
      fontStyle: "bold",
      backgroundColor: "#f8fbf2dd",
      padding: { x: 16, y: 10 },
    }).setOrigin(0.5).setDepth(1001);
  }

  private configureCamera() {
    const camera = this.cameras.main;
    camera.setBounds(-1200, -720, 2400, 1440);
    camera.centerOn(0, 0);
    camera.setZoom(0.9);
    this.bridge.emit("cameraChanged", { zoom: camera.zoom });
  }

  private configureInput() {
    this.input.on("pointerdown", (pointer: Phaser.Input.Pointer) => {
      this.isDragging = true;
      this.dragStart.set(pointer.x, pointer.y);
      this.cameraStart.set(this.cameras.main.scrollX, this.cameras.main.scrollY);
    });

    this.input.on("pointermove", (pointer: Phaser.Input.Pointer) => {
      if (!this.isDragging || !pointer.isDown) return;
      const camera = this.cameras.main;
      camera.scrollX = this.cameraStart.x - (pointer.x - this.dragStart.x) / camera.zoom;
      camera.scrollY = this.cameraStart.y - (pointer.y - this.dragStart.y) / camera.zoom;
    });

    this.input.on("pointerup", () => { this.isDragging = false; });
    this.input.on("pointerupoutside", () => { this.isDragging = false; });
    this.input.on("wheel", (_pointer: Phaser.Input.Pointer, _objects: Phaser.GameObjects.GameObject[], _deltaX: number, deltaY: number) => {
      const camera = this.cameras.main;
      camera.setZoom(Phaser.Math.Clamp(camera.zoom - deltaY * 0.001, 0.55, 1.45));
      this.bridge.emit("cameraChanged", { zoom: camera.zoom });
    });
  }
}
