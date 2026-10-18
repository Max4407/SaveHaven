# Town gameplay audit — 2026-10-17

Scope: Town Experience game functionality. Preserve teammate presentation and backend economy ownership.

## Completed

- Fixed stationary building clicks being consumed as drags. Move/Sell selection now opens.
- Active placement previews cannot be replaced by starting an owned-building drag.
- Escape cancels placement without submitting a purchase or move.
- Renamed the selected-building action from “Move free” to “Move”; moving remains free.
- Browser-tested on fictional local data: cancel, buy, select, free move, reload saved position, sell, reload wallet and layout, reserved-road rejection, and Escape cancellation.
- Verified the wallet sequence 300 → 200 → 200 → 260 for purchase → move → sale (100 cost, 60 refund).
- Frontend: 29 tests passed, lint passed, production build passed. Existing large-bundle warning remains.

## Remaining acceptance checks

1. Prevent overlapping scene requests while a purchase/move/sale is pending; exercise delayed and failed responses and repeated input. Catalog buttons currently disable, but scene drag input is independent.
2. Verify drag anchoring for 2×2 and 3×3 buildings and releasing outside the canvas. Compare ghost footprint, final snapped cells, and reloaded position.
3. Check small, large, tall, wide, and transparent assets for pivots, hit areas, scale, and depth ordering; exercise pan/zoom at laptop sizes.
4. Rehearse level 2/3 unlocks and expanded districts against server rewards, then repeat the loop in deployment with durable persistence. This browser run used an in-memory fixture backend; page reload persistence does not establish restart durability.
5. Coordinate catalog completeness with its owner: the current catalog presents 12 buildings; the plan also targets 4–8 decorations. Do not add economy rules or unlicensed assets to fill the gap.

Existing grid and page tests cover placement validation and rejected server operations, but mocked canvas tests do not replace the remaining real Phaser checks.
