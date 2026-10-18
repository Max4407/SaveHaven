export type PerimeterTree = {
  x: number;
  y: number;
  variant: 1 | 2 | 3 | 4;
  scale: number;
  flipX: boolean;
};

const EDGE_INSET = 70;
const CORNER_CLEARANCE = 130;
const MINIMUM_SPACING = 56;
const SPACING_VARIATION = 24;
const EDGE_JITTER = 26;
const CLUSTER_CHANCE = 0.42;

function seededRandom(seed: number) {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
  };
}

export function generatePerimeterTrees(
  worldWidth: number,
  worldHeight: number,
  seed = 8_417,
): PerimeterTree[] {
  const random = seededRandom(seed);
  const trees: PerimeterTree[] = [];
  const halfWidth = worldWidth / 2;
  const halfHeight = worldHeight / 2;

  const addTree = (x: number, y: number) => {
    trees.push({
      x,
      y,
      variant: (Math.floor(random() * 4) + 1) as PerimeterTree["variant"],
      scale: 1.15 + random() * 0.4,
      flipX: random() > 0.5,
    });
  };

  for (const side of [-1, 1]) {
    let x = -halfWidth + CORNER_CLEARANCE + random() * MINIMUM_SPACING;
    while (x < halfWidth - CORNER_CLEARANCE) {
      const edgeY = side * (halfHeight - EDGE_INSET - random() * EDGE_JITTER);
      addTree(x + (random() - 0.5) * 24, edgeY);
      if (random() < CLUSTER_CHANCE) {
        addTree(
          x + (random() - 0.5) * 46,
          edgeY - side * (48 + random() * 42),
        );
      }
      x += MINIMUM_SPACING + random() * SPACING_VARIATION;
    }
  }

  for (const side of [-1, 1]) {
    let y = -halfHeight + CORNER_CLEARANCE + random() * MINIMUM_SPACING;
    while (y < halfHeight - CORNER_CLEARANCE) {
      const edgeX = side * (halfWidth - EDGE_INSET - random() * EDGE_JITTER);
      addTree(edgeX, y + (random() - 0.5) * 24);
      if (random() < CLUSTER_CHANCE) {
        addTree(
          edgeX - side * (48 + random() * 42),
          y + (random() - 0.5) * 46,
        );
      }
      y += MINIMUM_SPACING + random() * SPACING_VARIATION;
    }
  }

  return trees.sort((first, second) => first.y - second.y);
}
