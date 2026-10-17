import { useEffect, useRef } from "react";
import type { DragEvent } from "react";
import Phaser from "phaser";
import { BUILDING_DRAG_TYPE, isBuildingId } from "./catalog/buildingCatalog";
import { EmptyTownScene } from "./scenes/EmptyTownScene";
import type { TownBridge } from "./townBridge";

type TownCanvasProps = {
  bridge: TownBridge;
};

export function TownCanvas({ bridge }: TownCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  const handleDragOver = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
    const bounds = event.currentTarget.getBoundingClientRect();
    bridge.emit("buildingDragMoved", {
      screenX: event.clientX - bounds.left,
      screenY: event.clientY - bounds.top,
    });
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    const buildingId = event.dataTransfer.getData(BUILDING_DRAG_TYPE)
      || event.dataTransfer.getData("text/plain");

    if (!isBuildingId(buildingId)) return;

    const bounds = event.currentTarget.getBoundingClientRect();
    bridge.emit("buildingDropped", {
      buildingId,
      screenX: event.clientX - bounds.left,
      screenY: event.clientY - bounds.top,
    });
    bridge.emit("buildingDragEnded", {});
  };

  useEffect(() => {
    if (!containerRef.current) return;

    const game = new Phaser.Game({
      type: Phaser.AUTO,
      parent: containerRef.current,
      transparent: true,
      scene: [new EmptyTownScene(bridge)],
      scale: {
        mode: Phaser.Scale.RESIZE,
        width: "100%",
        height: "100%",
      },
      render: {
        antialias: false,
        pixelArt: true,
      },
    });

    return () => game.destroy(true);
  }, [bridge]);

  return (
    <div
      className="town-canvas"
      ref={containerRef}
      aria-label="Interactive town map and building drop area"
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    />
  );
}
