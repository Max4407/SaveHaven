# Town gameplay audit — 2026-10-17

Scope: Town Experience game functionality. Preserve teammate presentation and backend economy ownership.

## Subsequent requested map changes

- Placement guides are hidden outside placement/move mode.
- Removed permanent road markings and all reserved route cells.
- Every level now has the full 15×15 buildable map; catalog level unlocks, outer map bounds, and collisions remain enforced.
- The API shape is unchanged: district covers coordinates 0–14 and infrastructure has an empty reserved-cell list. This supersedes the district-expansion and route expectations below. `docs/PLAN.md` remains unchanged pending explicit approval to edit it.
- Verified 28 focused backend tests and all 33 frontend tests after this rule change.

## Completed

- Fixed stationary building clicks being consumed as drags. Move/Sell selection now opens.
- Active placement previews cannot be replaced by starting an owned-building drag.
- Escape cancels placement without submitting a purchase or move.
- Renamed the selected-building action from “Move free” to “Move”; moving remains free.
- Browser-tested on fictional local data: cancel, buy, select, free move, reload saved position, sell, reload wallet and layout, reserved-road rejection, and Escape cancellation.
- Verified the wallet sequence 300 → 200 → 200 → 260 for purchase → move → sale (100 cost, 60 refund).
- Frontend: 29 tests passed, lint passed, production build passed. Existing large-bundle warning remains.

## Remaining acceptance checks

1. Completed action serialization within the town page: purchase, move, sale, simulation, and reset share a synchronous pending guard and scene lock. Confirmed state reaches Phaser before unlocking; rejected requests restore the last confirmed state. Regression tests cover same-frame duplicates, delayed purchase success/failure, and competing actions during sale/simulation/reset.
2. Fixed drag anchoring: sprite-center coordinates now convert back to the footprint's top-left cell for 1×1, 2×2, and 3×3 buildings, including odd/even rows. Invalid, outside-canvas, and sidebar drops cancel. Browser-checked a 2×2 hut move and sidebar cancellation; 3×3 coverage is automated, with representative art review still below.
3. Check small, large, tall, wide, and transparent assets for pivots, hit areas, scale, and depth ordering; exercise pan/zoom at laptop sizes.
4. Rehearse level 2/3 unlocks and expanded districts against server rewards, then repeat the loop in deployment with durable persistence. This browser run used an in-memory fixture backend; page reload persistence does not establish restart durability.
5. Coordinate catalog completeness with its owner: the current catalog presents 12 buildings; the plan also targets 4–8 decorations. Do not add economy rules or unlicensed assets to fill the gap.

Existing grid and page tests cover placement validation and rejected server operations, but mocked canvas tests do not replace the remaining real Phaser checks.

Latest gameplay verification: 34 targeted tests passed across scene, page, and grid suites; production build and lint passed. Local preview now uses an isolated temporary SQLite file instead of in-memory SQLite. Deployment durability still requires a separate rehearsal.
