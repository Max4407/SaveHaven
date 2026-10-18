import { useEffect, useRef } from "react";
import type { DragEvent } from "react";
import Phaser from "phaser";
import type { BuildingFacing, GameState, TownCatalog } from "../../api/types";
import { TownScene } from "./scenes/TownScene";
import {
  CATALOG_DRAG_TYPE,
  CATALOG_FACING_TYPE,
  type TownBridge,
} from "./townBridge";

type TownCanvasProps = {
  bridge: TownBridge;
  catalog: TownCatalog;
  state: GameState;
};

export function TownCanvas({ bridge, catalog, state }: TownCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const activeCatalogPlacement = useRef<{
    catalogItemId: string;
    facing: BuildingFacing;
  } | null>(null);
  const initialSceneData = useRef({ catalogItems: catalog.items, state });
  const previousState = useRef(state);

  const canvasCoordinates = (event: DragEvent<HTMLDivElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    return {
      canvasX: event.clientX - bounds.left,
      canvasY: event.clientY - bounds.top,
    };
  };

  const handleDragOver = (event: DragEvent<HTMLDivElement>) => {
    const placement = activeCatalogPlacement.current;
    if (!placement) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
    bridge.emit("catalogDragMoved", {
      catalogItemId: placement.catalogItemId,
      ...canvasCoordinates(event),
    });
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    const catalogItemId = event.dataTransfer.getData(CATALOG_DRAG_TYPE)
      || event.dataTransfer.getData("text/plain")
      || activeCatalogPlacement.current?.catalogItemId;
    if (!catalogItemId || !catalog.items.some((item) => item.id === catalogItemId)) return;
    const transferredFacing = event.dataTransfer.getData(CATALOG_FACING_TYPE);
    const facing = transferredFacing === "right" || transferredFacing === "left"
      ? transferredFacing
      : activeCatalogPlacement.current?.facing ?? "left";
    bridge.emit("catalogDropped", { catalogItemId, facing, ...canvasCoordinates(event) });
    activeCatalogPlacement.current = null;
  };

  useEffect(() => {
    if (!containerRef.current) return;

    const unsubscribeDragStart = bridge.subscribe("catalogDragStarted", (placement) => {
      activeCatalogPlacement.current = placement;
    });

    const game = new Phaser.Game({
      type: Phaser.AUTO,
      parent: containerRef.current,
      transparent: true,
      scene: [new TownScene(
        bridge,
        initialSceneData.current.catalogItems,
        initialSceneData.current.state,
      )],
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

    return () => {
      unsubscribeDragStart();
      game.destroy(true);
    };
  }, [bridge]);

  useEffect(() => {
    if (previousState.current === state) return;
    previousState.current = state;
    bridge.emit("stateChanged", { state });
  }, [bridge, state]);

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
