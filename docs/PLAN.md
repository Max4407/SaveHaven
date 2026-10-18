# SaveHaven Product and Implementation Plan

## 1. Summary

SaveHaven is a hackathon web application that turns healthy saving behavior into progress in a decorative town-building game.

It combines two experiences:

1. **Financial planning:** Use fictional Capital One Nessie banking data to analyze income and spending, forecast near-term income, create a savings goal, and recommend a savings and safe-to-spend plan.
2. **Town building:** Convert progress against that plan into virtual Town Coins and Town XP. Players use those rewards to buy, place, move, and arrange buildings and decorations.

The finance and game domains remain separate. Finance produces completed plan-period evaluations; a reward service converts those evaluations into idempotent game events.

The team is Max, Kevin, Phuc, and Ray. The target is a reliable, polished vertical slice within approximately 36–40 elapsed hours.

## 2. Product goals

- Make saving progress visible and emotionally rewarding.
- Give users an understandable forecast and actionable weekly plan.
- Make saving the primary way to earn game currency.
- Provide enough buildings and placement freedom for meaningful creative expression.
- Demonstrate a complete finance-to-game loop using only fictional data.
- Keep the demo dependable when Nessie or the network is unavailable.

### Product principles

- Forecasts explain their assumptions.
- Penalties slow progress but never destroy a player's existing town.
- Unexpected essential expenses should lead to replanning rather than punishment.
- The application never asks for real bank credentials.
- Building variety is data-driven rather than implemented as separate behaviors.
- Scope and demo reliability take priority over speculative features.

## 3. Demo story

The target presentation flow is:

1. Sign in through a normal email-and-password form using a pre-seeded fictional account.
2. Choose one of several curated fictional Nessie profiles.
3. View accounts, balances, recurring income, bills, and spending categories.
4. Create a goal such as “Save $800 for a bike by December.”
5. Review the recommended weekly savings and safe-to-spend amounts.
6. Accept the plan and receive a small onboarding reward.
7. Simulate the end of a successful week.
8. Review why Town Coins and XP were awarded.
9. Enter the town, buy a building, and place or move it.
10. Optionally simulate an off-plan week to show a bounded consequence and recovery path.

The presentation should take 2–3 minutes. Every step must work from a fresh browser before stretch work begins.

## 4. MVP scope

### Onboarding

- Credential-style login limited to pre-seeded fictional accounts, backed by a signed server session.
- No public registration, password recovery, email delivery, or acceptance of non-demo accounts.
- A “Connect a demo bank” screen.
- Several preselected fictional Nessie customers with useful histories.
- A clear sandbox notice.
- Server-side mapping between the SaveHaven user and Nessie customer ID.

Suggested notice:

> SaveHaven uses Capital One's Nessie sandbox. All accounts and transactions shown here are fictional. Do not enter real banking credentials or account information.

### Financial experience

- Account and balance summary.
- Normalized transaction history.
- Spending by category.
- Recurring-income detection.
- A 30-day income forecast with low, medium, or high confidence.
- One savings goal with amount and target date.
- Recommended weekly savings.
- Weekly safe-to-spend amount.
- A projection chart.
- An explanation of forecast assumptions.
- Weekly plan evaluation for game rewards.

### Town experience

- One regular or isometric grid matching the purchased asset pack.
- A target of 12–20 buildings and 4–8 decorations.
- Catalog categories and level-based unlocks.
- Buy, preview, place, cancel, select, move, and sell actions.
- Valid and invalid placement feedback.
- Collision and map-boundary validation.
- Camera pan and zoom.
- Persistent wallet, town progression, and layout.
- Three initial town levels.
- Savings-driven Town Coin and XP rewards.
- A savings streak.

### Reliability

- Sanitized local fixtures for every demo persona.
- Deterministic successful-week and off-plan-week simulations.
- A demo reset action.
- A deployed build.
- A backup screen recording.

## 5. Non-goals

- Real bank connections or real money movement.
- Collection of banking credentials or sensitive identity information.
- Production financial advice or identity verification.
- Public self-registration, production-scale authentication, and account recovery.
- Multiplayer, trading, visits, leaderboards, or chat.
- Citizens, combat, pathfinding, production chains, or complex building simulation.
- A large machine-learning model.
- Native mobile applications.
- Microservices or distributed infrastructure.

## 6. Architecture

SaveHaven is a modular monolith with one React application, one FastAPI service, and one database.

```text
Capital One Nessie API
          |
          v
    Nessie adapter ------> Normalized financial ledger
                                  |
                         +--------+---------+
                         |                  |
                         v                  v
                 Forecast engine    Spending planner
                         |                  |
                         +--------+---------+
                                  |
                                  v
                         Plan-period evaluation
                                  |
                                  v
                          Reward-event ledger
                                  |
                                  v
                              Game domain

React financial UI <---------- FastAPI ----------> Phaser town scene
                                     |
                                     v
                                  SQLite
```

### Domain responsibilities

The finance domain owns:

- Connected fictional customer.
- Normalized transactions.
- Income forecast.
- Goals and plans.
- Plan-period evaluation.

The game domain owns:

- Wallet and XP.
- Town level and unlocks.
- Catalog rules.
- Purchases and ownership.
- Placement and persisted layout.

The reward service is the only bridge. Phaser never calculates financial rewards, and finance code never directly changes a wallet or building.

## 7. Nessie integration

The backend is the only caller of the Nessie API. The API key never reaches the browser.

Relevant Nessie resources may include customers, accounts, deposits, withdrawals, transfers, purchases, bills, and merchants. Their differing shapes are normalized before use elsewhere.

```text
NormalizedTransaction
- id
- user_id
- nessie_account_id
- occurred_at
- signed_amount
- direction             # inflow or outflow
- kind                  # deposit, purchase, withdrawal, bill, transfer
- merchant_name
- category
- description
- source_id
```

Normalization must be deterministic and covered by tests. UI and planning modules consume only normalized data.

### Fixture fallback

- Each demo persona has a curated normalized fixture.
- Fixtures include recurring income, bills, discretionary spending, and a useful goal scenario.
- If Nessie is unavailable, the backend loads the same domain representation from fixtures.
- Activating fallback mode must not require a code change during the presentation.

## 8. Forecast and plan

The forecast is deliberately simple and explainable.

### Recurring income

1. Select positive deposits likely to represent income.
2. Group by source or description and approximate amount.
3. Calculate median time between matching deposits.
4. Detect likely weekly, biweekly, semimonthly, or monthly cadence.
5. Forecast the next date from the most recent date and detected cadence.
6. Forecast amount from the median of recent matches.
7. Fall back to a rolling median when no cadence is reliable.

Confidence is based on the number of observations, amount variance, interval variance, and recency. The UI should provide an explanation such as:

> We found four deposits near $1,400 occurring approximately every 14 days.

### Spending baseline

- Separate recurring bills from variable spending.
- Estimate variable spending with a recent rolling median.
- Distinguish fixed, essential variable, and discretionary spending where possible.
- Let the user identify an exceptional essential expense and recalculate the plan.

### Plan calculation

```text
remaining_goal_amount = goal_amount - amount_already_saved
remaining_weeks = max(1, weeks_until_target_date)
recommended_weekly_savings = remaining_goal_amount / remaining_weeks

safe_weekly_spending =
    forecast_weekly_income
    - weekly_share_of_recurring_bills
    - recommended_weekly_savings
    - safety_buffer
```

If safe weekly spending is negative, explain that the target amount or date may be unrealistic and propose a later date or lower contribution. Do not present a negative allowance as a workable plan.

The output is an educational planning estimate, not professional financial advice.

## 9. Weekly evaluation

Rewards are normally evaluated once per weekly plan period.

```text
PlanPeriodEvaluation
- id
- user_id
- period_start
- period_end
- planned_savings
- actual_net_savings
- planned_discretionary_spending
- actual_discretionary_spending
- savings_ratio
- adherence_tier
- exceptional_expense_flag
- explanation
- evaluated_at
```

Actual savings is the net increase toward the goal during the period, not the number of transfers. Money withdrawn from the goal reduces actual savings. Repeatedly moving the same money between accounts must not create repeated rewards.

## 10. Game economy

### Progression resources

- **Town Coins:** Purchase buildings and decorations.
- **Town XP:** Increase town level and unlock catalog groups.
- **Savings streak:** Reward consecutive successful plan periods with a capped bonus.

Give a one-time starter grant, initially 300 Town Coins, so the user can immediately try placement. Saving is the primary source of later currency. Buildings do not generate meaningful passive currency.

### Initial reward model

These values are tuning defaults:

```text
savings_ratio = max(0, actual_net_savings / planned_savings)
capped_ratio = min(savings_ratio, 1.25)
base_coins = round(400 * capped_ratio)

adherence_multiplier:
    1.00  within the discretionary plan
    0.75  moderately over plan
    0.50  substantially over plan

streak_bonus = min(base_coins * 0.05 * streak_weeks, base_coins * 0.25)
coins_awarded = round(base_coins * adherence_multiplier + streak_bonus)
```

A starting point for spending thresholds is 10–25% over plan for moderate and more than 25% for substantial.

### Penalties

- The primary penalty is a reduced reward.
- A substantially off-plan period may reset the savings streak.
- An optional explicit upkeep deduction must be small and capped at 5% of unspent Town Coins.
- A wallet never becomes negative.
- Existing buildings are never deleted or locked.
- Essential expenses or income disruption should offer replanning rather than punishment.
- Avoid applying both a large reward reduction and a large wallet deduction for the same behavior.

### Reward integrity

Each reward event has a server-enforced uniqueness constraint equivalent to:

```text
(user_id, plan_period_id, reward_type)
```

Reprocessing a period returns the original result rather than awarding it again.

## 11. Town design

### Data-driven catalog

A decorative item is defined by asset and metadata rather than a unique code path.

```json
{
  "id": "bakery_01",
  "name": "Corner Bakery",
  "category": "shops",
  "asset": "/houses-pack/small/bakery/bakery_1_new.png",
  "cost": 450,
  "levelRequired": 2,
  "footprint": { "width": 2, "height": 2 },
  "anchor": { "x": 0.5, "y": 0.9 },
  "townXp": 30
}
```

Suggested categories are houses, shops, civic buildings, parks and trees, roads and paths, small decorations, and landmarks.

### Asset organization

`frontend/Assets/` is the canonical location for game and font assets. The existing pack structure remains intact:

```text
frontend/Assets/
├── fonts/
│   └── gothic_pixel/
├── ForestVegetation/
├── free_grass/
└── houses-pack/
    ├── manifest.json
    ├── README.txt
    ├── small/
    └── large/
```

Vite should be configured with `publicDir: "Assets"`. Phaser can then load assets using root-relative URLs such as `/houses-pack/small/cottage/cottage_1_new.png`. Do not maintain a second copy under `frontend/public/` or in a repository-level asset directory.

The vendor `houses-pack/manifest.json` remains unchanged and supplies kind, group, variant, condition, file, and pivot information. SaveHaven-specific data such as price, footprint, unlock level, and Town XP belongs in the authoritative application catalog at `data/catalog/town_catalog.json`.

Existing vendor folder and file names are preserved even when they do not match project naming conventions. New project-owned assets should use lowercase kebab-case names.

### Placement

- Ghost preview follows the pointer.
- Valid placement is green; collision or out-of-bounds placement is red.
- Placement snaps to the map grid.
- Occupancy uses the catalog footprint.
- Purchase occurs only after confirmation.
- Canceling does not charge the player.
- Moving owned buildings is free.
- Selling refunds 50–75% of purchase cost.
- Depth sorting uses the object's lower screen position.
- Rotation is included only if matching directional art exists.

React owns page layout, catalog panels, wallet display, and messages. Phaser owns the rendered town, camera, selection, placement preview, collision visualization, and depth. A typed event bridge connects them. The server validates funds, ownership, bounds, and final placement.

### Asset workflow

1. Confirm each asset pack's license and projection style, and retain its license or README file.
2. Select the first 12–20 buildings for the SaveHaven catalog without moving or renaming the underlying vendor files.
3. Record scale, transparent padding, anchor, footprint, price, unlock level, and Town XP in SaveHaven catalog metadata.
4. Test five representative items: small, large, tall, wide, and transparent decoration.
5. Expand the catalog only after purchasing, placement, and persistence work end to end.
6. Preload only catalog-selected assets. Optimize files later only if measured page-load or rendering performance requires it.

Initial unlocks:

```text
Level 1: basic houses, trees, and paths
Level 2: shops and larger houses
Level 3: parks, civic buildings, and premium decorations
Level 4 stretch: landmarks or alternate themes
```

## 12. API surface

The exact schemas are frozen during the first three hours.

### Session and onboarding

```text
GET    /health
POST   /api/auth/demo-login
POST   /api/auth/logout
GET    /api/auth/session
GET    /api/demo/nessie-profiles
POST   /api/bank-connections
POST   /api/bank-connections/sync
```

### Finance

```text
GET    /api/dashboard
POST   /api/goals
GET    /api/goals/{goal_id}
PATCH  /api/goals/{goal_id}
GET    /api/goals/{goal_id}/plan
POST   /api/goals/{goal_id}/accept-plan
GET    /api/plan-periods/current
```

The dashboard endpoint returns the normalized summary, forecast, categories, active goal, and current plan in one response.

### Game

```text
GET    /api/game/catalog
GET    /api/game/state
GET    /api/game/rewards
POST   /api/game/buildings
PATCH  /api/game/buildings/{building_id}
DELETE /api/game/buildings/{building_id}
```

Creating a building atomically validates the user, catalog item, unlock, coordinates, occupancy, and wallet before deducting cost and persisting the building.

### Demo controls

```text
POST /api/demo/simulate-successful-week
POST /api/demo/simulate-off-plan-week
POST /api/demo/reset
```

Demo controls must be removed or separately protected if the application moves beyond a hackathon demo.

## 13. Core data model

Minimum persisted entities:

- `users`: stable demo identity used to scope all persisted account data.
- `bank_connections`: SaveHaven user to Nessie customer mapping.
- `normalized_transactions`: cached domain transactions.
- `savings_goals`: amount, current progress, date, and status.
- `savings_plans`: forecast, bills, recommended savings, safe spending, confidence.
- `plan_period_evaluations`: planned versus actual weekly result.
- `reward_events`: idempotent coin and XP changes with explanation.
- `game_wallets`: balance, total earned, XP, level, and streak.
- `placed_buildings`: owner, catalog ID, grid position, rotation, and purchase time.

The building catalog remains static JSON during the hackathon.

## 14. Team ownership

Assign each teammate exactly one primary lane at kickoff. The available information does not identify which name matches each skill description, so record the mapping here once agreed.

| Primary role | Best fit | Owner | Main deliverables |
|---|---|---|---|
| Product, UX, and Forecast | UI/UX and ML teammate | TBD | Wireframes, design tokens, forecast, confidence copy, catalog curation, pitch |
| Platform and Data | Backend and infrastructure teammate | TBD | Nessie adapter, persistence, API, session, deployment, fixtures |
| Financial Experience | Frontend-preferring teammate | TBD | Dashboard, charts, goal and plan flows, weekly review |
| Town Experience | Frontend-preferring teammate | TBD | Phaser scene, placement, camera, collision, catalog UI, assets |

Both frontend owners begin from agreed fixtures rather than waiting for the backend. The Product/Forecast owner supplies expected forecast outputs, while Platform integrates them into the service. One person owns final scope cuts and demo narrative.

## 15. 40-hour schedule

### Hours 0–3: Decisions and contracts

- Assign roles.
- Verify Nessie credentials and endpoints.
- Select demo personas.
- Confirm asset license and choose the initial catalog.
- Draw the essential screens.
- Freeze request and response shapes.
- Create finance and game fixtures.
- Write the exact demo script.

### Hours 3–8: Skeleton

- Scaffold frontend, backend, database, tests, and Phaser.
- Deploy a hello-world build.
- Render one real building asset.
- Fetch one Nessie account through the backend.
- Complete navigation, fictional email/password login, and profile selection.

Time-box the initial Phaser asset spike to 90 minutes. If the art cannot be rendered and positioned reliably, use a simpler React or Canvas grid while preserving catalog and backend contracts.

### Hours 8–18: Parallel feature work

- Platform: normalization, persistence, sessions, routes, and fallback.
- Product/Forecast: categories, income forecast, plan, and explanations.
- Finance UI: dashboard, goals, charts, and plan.
- Town UI: camera, grid, catalog, preview, collision, and movement.

### Hours 18–28: Integration

- Replace fixtures with backend calls.
- Connect plan evaluation to rewards and wallet.
- Validate purchases and placement on the server.
- Persist and reload the town.
- Add success, off-plan, and reset demo controls.
- Expand catalog only after the vertical slice works.

### Hours 28–34: Polish

- Loading, empty, and error states.
- Forecast explanations and financial disclaimer.
- Reward and placement feedback.
- Common laptop viewport testing.
- Asset compression and secret review.
- Full deployed-demo rehearsal.

### Hours 34–40: Freeze

- Stop feature development.
- Test the exact demo repeatedly from a fresh browser.
- Verify fallback and reset.
- Fix only presentation-blocking issues.
- Record a backup demonstration.
- Finalize slides and speaking transitions.

## 16. Major risks

| Risk | Mitigation |
|---|---|
| Nessie is unavailable or sparse | Curated normalized fixtures and automatic fallback |
| Authentication consumes the schedule | Pre-seeded fictional credentials, signed sessions, and a two-hour time box |
| Asset scale or anchors are inconsistent | Normalize five representative assets before expanding |
| Phaser integration blocks progress | 90-minute spike and simpler rendering fallback |
| Frontend waits on backend | Freeze schemas and build against fixtures |
| Penalties feel hostile | Reduced rewards, capped deductions, replanning, no lost buildings |
| Rewards can be replayed | Database-enforced idempotency |
| Client tampers with wallet or map | Server-authoritative purchases and placement |
| SQLite deployment loses state | Persistent disk if available plus deterministic seeding/reset |
| Asset license restricts redistribution | Verify terms and exclude restricted source art |
| Asset quantity expands scope | Fixed initial catalog; add only after end-to-end stability |

## 17. Definition of done

The MVP is complete when:

- A fresh user can complete the target demo from the deployed URL.
- The Nessie key never reaches the browser or repository.
- No screen accepts real bank credentials.
- Only the documented fictional SaveHaven accounts can sign in; public registration is unavailable.
- Dashboard, goal, forecast, plan, reward, wallet, and town share one user state.
- Goals, wallet progress, and town layouts persist independently for each demo account in SQLite.
- A successful period creates an explainable reward exactly once.
- An off-plan period creates a bounded, explainable consequence.
- A user can purchase, place, move, and persist multiple decorative buildings.
- At least 12 catalog items are presentation-ready, or the team explicitly accepts a smaller polished set.
- The demo works without a live Nessie response.
- Reset restores the presentation state.
- The team has rehearsed and recorded a backup.

## 18. Kickoff decisions

Record these before implementation diverges:

- Name-to-role assignments for Max, Kevin, Phuc, and Ray.
- The selected Nessie personas.
- Asset projection and grid size.
- The first catalog items.
- Reward thresholds and initial prices.
- Hosting platform.
- Whether simulated saving writes to Nessie or only to the local demo ledger.

## 19. References

- [Capital One Nessie overview](https://nessieisreal.com/)
- [Capital One Nessie API documentation](https://prod.nessieisreal.com/docs)
- [Vite documentation](https://vite.dev/guide/)
- [Phaser documentation](https://docs.phaser.io/)
- [OWASP Authentication Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html)
- [OWASP Session Management Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html)
- [FTC guidance on protecting personal information](https://www.ftc.gov/business-guidance/resources/protecting-personal-information-guide-business)
