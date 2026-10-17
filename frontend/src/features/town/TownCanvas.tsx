import { useEffect, useRef } from "react";
import Phaser from "phaser";
import type { GameState, TownCatalog } from "../../api/types";
import { TownScene } from "./scenes/TownScene";
import type { TownBridge } from "./townBridge";

type TownCanvasProps = {
  bridge: TownBridge;
  catalog: TownCatalog;
  state: GameState;
};

export function TownCanvas({ bridge, catalog, state }: TownCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const game = new Phaser.Game({
      type: Phaser.AUTO,
      parent: containerRef.current,
      backgroundColor: "#c9e4dd",
      scene: [new TownScene(bridge, catalog.items, state)],
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
  }, [bridge, catalog, state]);

  return <div className="town-canvas" ref={containerRef} aria-label="Interactive town map" />;
}
