import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { DragEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { ApiError } from "../../api/client";
import { getHealth } from "../../api/finance";
import {
  buyBuilding,
  getGameRewards,
  getGameState,
  getTownCatalog,
  moveBuilding,
  resetDemo,
  sellBuilding,
  simulateWeek,
} from "../../api/game";
import type { GameState, SimulatedWeek, TownCatalogItem } from "../../api/types";
import { usePlacementSound } from "./usePlacementSound";
import { TownMusic } from "./TownMusic";
import { TownCanvas } from "./TownCanvas";
import { CATALOG_DRAG_TYPE, createTownBridge } from "./townBridge";

type PlacementStatus = { active: boolean; valid: boolean; reason: string | null };

function formatDollars(cents: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(cents / 100);
}

function mutationMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  return "The town could not be updated. Please try again.";
}

function createIdempotencyKey(scenario: string): string {
  const random = globalThis.crypto?.randomUUID?.().replaceAll("-", "")
    ?? `${Date.now()}${Math.random().toString(16).slice(2)}`;
  return `${scenario}-${random}`.slice(0, 80);
}

function TownPage() {
  const playPlacementSound = usePlacementSound();
  const bridge = useMemo(() => createTownBridge(), []);
  const queryClient = useQueryClient();
  const actionPending = useRef(false);
  const placementSoundPending = useRef(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [category, setCategory] = useState("all");
  const [selectedBuildingId, setSelectedBuildingId] = useState<number | null>(null);
  const [placement, setPlacement] = useState<PlacementStatus>({ active: false, valid: false, reason: null });
  const [actionError, setActionError] = useState<string | null>(null);
  const [celebration, setCelebration] = useState<SimulatedWeek | null>(null);

  const catalogQuery = useQuery({ queryKey: ["town-catalog"], queryFn: getTownCatalog });
  const stateQuery = useQuery({ queryKey: ["game-state"], queryFn: getGameState });
  const rewardsQuery = useQuery({ queryKey: ["game-rewards"], queryFn: getGameRewards });
  const healthQuery = useQuery({ queryKey: ["health"], queryFn: getHealth });

  const startAction = useCallback((submit: () => void) => {
    // A ref closes the same-frame gap before mutation state can rerender React.
    if (actionPending.current) return;
    actionPending.current = true;
    placementSoundPending.current = false;
    bridge.emit("interactionLocked", { locked: true });
    bridge.emit("cancelPlacement", {});
    void queryClient.cancelQueries({ queryKey: ["game-state"] });
    submit();
  }, [bridge, queryClient]);

  const finishAction = () => {
    // Update Phaser before accepting another action, including after a rejection.
    const confirmed = queryClient.getQueryData<GameState>(["game-state"]);
    if (confirmed) bridge.emit("stateChanged", { state: confirmed });
    if (confirmed && placementSoundPending.current) playPlacementSound();
    placementSoundPending.current = false;
    actionPending.current = false;
    bridge.emit("interactionLocked", { locked: false });
  };

  const applyConfirmedState = (state: GameState) => {
    queryClient.setQueryData(["game-state"], state);
    setActionError(null);
    setSelectedBuildingId(null);
  };

  const purchaseMutation = useMutation({
    mutationFn: buyBuilding,
    onSuccess: (state) => {
      applyConfirmedState(state);
      placementSoundPending.current = true;
    },
    onError: (error) => setActionError(mutationMessage(error)),
    onSettled: finishAction,
  });
  const moveMutation = useMutation({
    mutationFn: ({ buildingId, gridX, gridY }: { buildingId: number; gridX: number; gridY: number }) => (
      moveBuilding(buildingId, { grid_x: gridX, grid_y: gridY })
    ),
    onSuccess: (state) => {
      applyConfirmedState(state);
      placementSoundPending.current = true;
    },
    onError: (error) => setActionError(mutationMessage(error)),
    onSettled: finishAction,
  });
  const sellMutation = useMutation({
    mutationFn: sellBuilding,
    onSuccess: applyConfirmedState,
    onError: (error) => setActionError(mutationMessage(error)),
    onSettled: finishAction,
  });
  const simulateMutation = useMutation({
    mutationFn: (scenario: "successful" | "off-plan") => simulateWeek(
      scenario,
      createIdempotencyKey(scenario),
    ),
    onSuccess: (result) => {
      applyConfirmedState(result.game_state);
      setCelebration(result);
      void queryClient.invalidateQueries({ queryKey: ["game-rewards"] });
      void queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
    onError: (error) => setActionError(mutationMessage(error)),
    onSettled: finishAction,
  });
  const resetMutation = useMutation({
    mutationFn: resetDemo,
    onSuccess: (result) => {
      applyConfirmedState(result.game_state);
      if (result.cleanup_warnings.length > 0) {
        setActionError(result.cleanup_warnings.join(" "));
      }
      setCelebration(null);
      void queryClient.invalidateQueries({ queryKey: ["game-rewards"] });
      void queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
    onError: (error) => setActionError(mutationMessage(error)),
    onSettled: finishAction,
  });

  useEffect(() => {
    const unsubscribeSelection = bridge.subscribe("buildingSelected", ({ buildingId }) => {
      setSelectedBuildingId(buildingId);
      setIsSidebarOpen(true);
    });
    const unsubscribePlacement = bridge.subscribe("placementChanged", setPlacement);
    const unsubscribeConfirmation = bridge.subscribe("placementConfirmed", (detail) => {
      startAction(() => {
        setActionError(null);
        if (detail.buildingId == null) {
          purchaseMutation.mutate({
            catalog_item_id: detail.catalogItemId,
            grid_x: detail.gridX,
            grid_y: detail.gridY,
          });
        } else {
          moveMutation.mutate({
            buildingId: detail.buildingId,
            gridX: detail.gridX,
            gridY: detail.gridY,
          });
        }
      });
    });
    return () => {
      unsubscribeSelection();
      unsubscribePlacement();
      unsubscribeConfirmation();
    };
  }, [bridge, purchaseMutation, moveMutation, startAction]);

  const catalog = catalogQuery.data;
  const state = stateQuery.data;
  const selectedBuilding = state?.buildings.find((building) => building.id === selectedBuildingId);
  const selectedItem = catalog?.items.find((item) => item.id === selectedBuilding?.catalog_item_id);
  const categories = catalog ? ["all", ...new Set(catalog.items.map((item) => item.category))] : ["all"];
  const visibleItems = catalog?.items.filter(
    (item) => category === "all" || item.category === category,
  ) ?? [];
  const latestReward = rewardsQuery.data?.rewards.find((reward) => reward.reward_type === "weekly_plan");
  const isMutating = purchaseMutation.isPending || moveMutation.isPending || sellMutation.isPending
    || simulateMutation.isPending || resetMutation.isPending;
  const loadError = catalogQuery.error ?? stateQuery.error;

  const beginPurchase = (item: TownCatalogItem) => {
    if (actionPending.current) return;
    setSelectedBuildingId(null);
    setActionError(null);
    bridge.emit("startPlacement", { catalogItemId: item.id });
  };

  const beginCatalogDrag = (event: DragEvent<HTMLElement>, item: TownCatalogItem) => {
    if (actionPending.current) {
      event.preventDefault();
      return;
    }
    setSelectedBuildingId(null);
    setActionError(null);
    event.dataTransfer.effectAllowed = "copy";
    event.dataTransfer.setData(CATALOG_DRAG_TYPE, item.id);
    event.dataTransfer.setData("text/plain", item.id);
    bridge.emit("catalogDragStarted", { catalogItemId: item.id });
  };

  if (catalogQuery.isLoading || stateQuery.isLoading) {
    return <main className="status-page"><div className="status-card"><p>Preparing your town…</p></div></main>;
  }
  if (!catalog || !state || loadError) {
    return (
      <main className="status-page">
        <div className="status-card">
          <p className="eyebrow">Town unavailable</p>
          <h1>We could not load your haven.</h1>
          <p>{mutationMessage(loadError)}</p>
          <button className="primary-button" type="button" onClick={() => {
            void catalogQuery.refetch();
            void stateQuery.refetch();
          }}>Try again</button>
        </div>
      </main>
    );
  }

  return (
    <main className={`town-page${isSidebarOpen ? " sidebar-open" : ""}`}>
      <TownCanvas bridge={bridge} catalog={catalog} state={state} />
      <TownMusic />

      {placement.active && (
        <div className={`placement-banner ${placement.valid ? "valid" : "invalid"}`} role="status">
          <strong>{placement.valid ? "Ready to place" : placement.reason}</strong>
          <span>Drop or click a highlighted cell to confirm.</span>
          <button type="button" onClick={() => bridge.emit("cancelPlacement", {})}>Cancel</button>
        </div>
      )}

      <button
        className={`sidebar-toggle${isSidebarOpen ? " open" : ""}`}
        type="button"
        aria-controls="town-sidebar"
        aria-expanded={isSidebarOpen}
        aria-label={`${isSidebarOpen ? "Collapse" : "Open"} town sidebar`}
        onClick={() => setIsSidebarOpen((isOpen) => !isOpen)}
      >
        <span aria-hidden="true">{isSidebarOpen ? "›" : "‹"}</span>
      </button>

      <aside className={`town-sidebar${isSidebarOpen ? " open" : ""}`} id="town-sidebar" aria-label="Building catalog">
        <header className="town-sidebar-header">
          <div>
            <p className="eyebrow">Level {state.wallet.level} · {state.wallet.level_name}</p>
            <h1>Your future haven</h1>
            <p>Saving progress unlocks buildings. Make this town yours.</p>
          </div>
          <Link className="route-arrow" to="/dashboard" aria-label="Open bank and goals">
            <span aria-hidden="true">→</span>
          </Link>
        </header>

        <div className="town-resources" aria-label="Town resources">
          <span><i aria-hidden="true">◆</i><strong>{state.wallet.coin_balance}</strong><small>Coins</small></span>
          <span><i aria-hidden="true">✦</i><strong>{state.wallet.xp}</strong><small>XP</small></span>
          <span><i aria-hidden="true">↗</i><strong>{state.wallet.streak_weeks}</strong><small>Streak</small></span>
        </div>

        <div className="town-catalog-body">
        <section className="town-level-card" aria-label="Town level progress">
          <div><strong>{state.wallet.level_name}</strong><span>{state.progression.next_level_xp == null ? "Future XP banked" : `${state.wallet.xp} / ${state.progression.next_level_xp} XP`}</span></div>
          <div className="level-track"><span style={{ width: `${state.progression.progress_percent}%` }} /></div>
          <p>XP comes only from verified savings</p>
        </section>

        {actionError && <p className="error-banner town-action-error" role="alert">{actionError}</p>}

        {selectedBuilding && selectedItem ? (
          <section className="building-actions" aria-label="Selected building">
            <div className="catalog-art"><img src={selectedItem.asset} alt="" /></div>
            <div>
              <p className="eyebrow">Selected building</p>
              <h2>{selectedItem.name}</h2>
              <p>Purchased for {selectedBuilding.purchase_price_coins} Coins · sells for {Math.floor(selectedBuilding.purchase_price_coins * 0.6)}</p>
            </div>
            <button className="secondary-button" type="button" disabled={isMutating} onClick={() => {
              bridge.emit("startPlacement", { catalogItemId: selectedItem.id, buildingId: selectedBuilding.id });
            }}>Move</button>
            <button className="sell-button" type="button" disabled={isMutating} onClick={() => startAction(() => sellMutation.mutate(selectedBuilding.id))}>Sell</button>
          </section>
        ) : (
          <>
            <div className="catalog-heading">
              <div><p className="eyebrow">Building catalog</p><h2>Build your haven</h2></div>
              <span className="preview-pill">Server verified</span>
            </div>
            <p className="catalog-intro">Drag an unlocked building onto the grass, or use its place button.</p>

            <div className="catalog-filters" aria-label="Catalog categories">
              {categories.map((itemCategory) => (
                <button className={category === itemCategory ? "active" : ""} type="button" key={itemCategory} onClick={() => setCategory(itemCategory)}>
                  {itemCategory === "all" ? "All" : itemCategory}
                </button>
              ))}
            </div>

            <div className="catalog-grid">
              {visibleItems.map((item) => {
                const levelLocked = item.level_required > state.wallet.level;
                const unaffordable = item.cost_coins > state.wallet.coin_balance;
                const disabled = levelLocked || unaffordable || isMutating;
                return (
                  <article
                    className={`catalog-card${levelLocked ? " locked" : ""}${unaffordable && !levelLocked ? " unaffordable" : ""}`}
                    key={item.id}
                    draggable={!disabled}
                    onDragStart={(event) => beginCatalogDrag(event, item)}
                    onDragEnd={(event) => {
                      if (event.dataTransfer.dropEffect === "none") {
                        bridge.emit("cancelPlacement", {});
                      }
                    }}
                  >
                    <div className="catalog-art"><img src={item.asset} alt="" /></div>
                    <div className="catalog-card-copy">
                      <span className="level-pill">{levelLocked ? `Unlocks Level ${item.level_required}` : `${item.footprint.width}×${item.footprint.height}${item.landmark ? " landmark" : ""}`}</span>
                      <h3>{item.name}</h3>
                      <p><i aria-hidden="true">◆</i> {item.cost_coins}</p>
                      {unaffordable && !levelLocked ? (
                        <small className="affordability-note" id={`affordability-${item.id}`}>
                          You can’t afford this
                          <span>Need {item.cost_coins - state.wallet.coin_balance} more Coins</span>
                        </small>
                      ) : null}
                    </div>
                    <button type="button" disabled={disabled} aria-label={levelLocked ? `${item.name} locked until level ${item.level_required}` : `Place ${item.name}`} aria-describedby={unaffordable && !levelLocked ? `affordability-${item.id}` : undefined} title={unaffordable && !levelLocked ? "You can’t afford this yet" : undefined} onClick={() => beginPurchase(item)}>
                      {levelLocked ? "⌾" : "+"}
                    </button>
                  </article>
                );
              })}
            </div>
          </>
        )}

        {latestReward && (
          <section className="reward-explanation">
            <div><span>Latest savings reward</span><strong>+{latestReward.coins_awarded} Coins · +{latestReward.xp_awarded} XP</strong></div>
            <p>{latestReward.explanation}</p>
          </section>
        )}

        {healthQuery.data?.demo_controls_enabled && (
          <section className="demo-week-controls" aria-label="Demo week controls">
            <p className="eyebrow">Protected demo controls</p>
            <p className="demo-week-note">
              {healthQuery.data.data_mode === "live" && healthQuery.data.nessie_configured
                ? "Writes to a live Nessie sandbox connection, syncs it, then evaluates the imported transactions. Fixture fallback is labeled in the result."
                : "Fixture mode creates local bank-shaped transactions, then evaluates the week."}
            </p>
            <div>
              <button className="primary-button" type="button" disabled={isMutating} onClick={() => startAction(() => simulateMutation.mutate("successful"))}>Simulate success</button>
              <button className="secondary-button" type="button" disabled={isMutating} onClick={() => startAction(() => simulateMutation.mutate("off-plan"))}>Try off-plan</button>
            </div>
            <button className="text-button" type="button" disabled={isMutating} onClick={() => startAction(() => resetMutation.mutate())}>Reset town demo</button>
          </section>
        )}
        </div>
      </aside>

      {celebration && (
        <div className="town-modal-backdrop" role="presentation">
          <section className="town-celebration" role="dialog" aria-modal="true" aria-labelledby="reward-title">
            <span className="celebration-mark" aria-hidden="true">✦</span>
            <p className="eyebrow">{celebration.source === "live" ? "Nessie sandbox verified" : "Fixture fallback"}</p>
            <h2 id="reward-title">{celebration.reward.new_level > celebration.reward.previous_level ? `Welcome to ${celebration.game_state.wallet.level_name}` : "Your savings moved the town forward"}</h2>
            <div className="celebration-rewards">
              <strong>+{celebration.reward.coins_awarded} Coins</strong>
              <strong>+{celebration.reward.xp_awarded} XP</strong>
            </div>
            <div className="celebration-finance" aria-label="Verified weekly finances">
              <span><small>Saved from bank activity</small><strong>{formatDollars(celebration.evaluation.actual_net_savings_cents)}</strong></span>
              <span><small>Weekly target</small><strong>{formatDollars(celebration.evaluation.planned_savings_cents)}</strong></span>
              <span><small>Discretionary spending</small><strong>{formatDollars(celebration.evaluation.actual_discretionary_spending_cents)}</strong></span>
            </div>
            <p>{celebration.evaluation.explanation}</p>
            <p>{celebration.reward.explanation}</p>
            {celebration.reward.new_level > celebration.reward.previous_level && <p>New buildings are ready in the catalog.</p>}
            {celebration.unlocks.catalog_items.length > 0 && (
              <p>Unlocked: {celebration.unlocks.catalog_items.map((item) => item.name).join(", ")}.</p>
            )}
            <button className="primary-button" type="button" onClick={() => setCelebration(null)}>Continue building</button>
          </section>
        </div>
      )}
    </main>
  );
}

export default TownPage;
