import { useEffect, useRef } from "react";
import Phaser from "phaser";
import { EmptyTownScene } from "./scenes/EmptyTownScene";
import type { TownBridge } from "./townBridge";

type TownCanvasProps = {
  bridge: TownBridge;
};

export function TownCanvas({ bridge }: TownCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const game = new Phaser.Game({
      type: Phaser.AUTO,
      parent: containerRef.current,
      backgroundColor: "#c9e4dd",
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

  return <div className="town-canvas" ref={containerRef} aria-label="Interactive empty town map" />;
}
