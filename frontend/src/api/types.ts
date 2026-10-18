export type SessionUser = {
  id: string;
  display_name: string;
};

export type DemoProfile = {
  id: string;
  display_name: string;
  description: string;
  income_pattern: string;
};

export type BankConnection = {
  profile_id: string;
  nessie_customer_id: string;
  display_name: string;
  data_source: string;
  last_synced_at: string | null;
};

export type DashboardSummary = {
  as_of: string;
  total_balance_cents: number;
  checking_balance_cents: number;
  savings_balance_cents: number;
  income_last_30_days_cents: number;
  spending_last_30_days_cents: number;
};

export type Account = {
  source_account_id: string;
  account_type: string;
  nickname: string;
  balance_cents: number;
};

export type Transaction = {
  source_account_id: string;
  source_id: string;
  occurred_at: string;
  signed_amount_cents: number;
  direction: string;
  kind: string;
  merchant_name: string | null;
  category: string;
  description: string;
};

export type SpendingCategory = {
  category: string;
  amount_cents: number;
};

export type ImportSummary = {
  account_count: number;
  transaction_count: number;
  transaction_types: string[];
};

export type Forecast = {
  weekly_income_cents: number;
  weekly_recurring_bills_cents: number;
  weekly_variable_spending_cents: number;
  safety_buffer_cents: number;
  income_cadence: string;
  confidence: "low" | "medium" | "high";
  detected_deposit_count: number;
  evidence: string[];
};

export type SavingsGoal = {
  id: number;
  name: string;
  target_amount_cents: number;
  amount_already_saved_cents: number;
  target_date: string;
};

export type SavingsPlan = {
  goal_id: number;
  weekly_income_cents: number;
  weekly_recurring_bills_cents: number;
  weekly_variable_spending_cents: number;
  safety_buffer_cents: number;
  weekly_savings_cents: number;
  safe_to_spend_cents: number;
  confidence: "low" | "medium" | "high";
  income_cadence: string;
  feasible: boolean;
  suggested_target_date: string | null;
  explanation: string;
  evidence: string[];
  status: "draft" | "accepted";
  accepted_at: string | null;
};

export type GoalPlan = {
  goal: SavingsGoal;
  forecast: Forecast;
  plan: SavingsPlan;
};

export type CreateGoalInput = {
  name: string;
  target_amount_cents: number;
  amount_already_saved_cents: number;
  target_date: string;
};

export type NessieEventType =
  | "paycheck"
  | "planned_purchase"
  | "unplanned_purchase"
  | "move_to_savings";

export type NessieEventResult = {
  event_type: NessieEventType;
  idempotency_key: string;
  created_records: string[];
  reused_records: string[];
  remote_records: Array<{
    resource: "deposits" | "withdrawals";
    record_id: string;
  }>;
  dashboard: Dashboard;
};

export type Dashboard = {
  connection: BankConnection;
  summary: DashboardSummary;
  accounts: Account[];
  recent_transactions: Transaction[];
  spending_by_category: SpendingCategory[];
  import_summary: ImportSummary;
  forecast: Forecast;
  active_goal: SavingsGoal | null;
  current_plan: SavingsPlan | null;
};

export type Health = {
  status: string;
  data_mode: string;
  nessie_configured: boolean;
  demo_controls_enabled: boolean;
};

export type TownCatalogItem = {
  id: string;
  name: string;
  category: string;
  asset: string;
  shadow_asset: string | null;
  cost_coins: number;
  level_required: number;
  footprint: { width: number; height: number };
  pivot: { x: number; y: number };
  landmark: boolean;
  render_kind?: "building" | "ground" | "food";
  resident_count?: number;
};

export type TownCatalog = { items: TownCatalogItem[] };

export type GameWallet = {
  coin_balance: number;
  total_coins_earned: number;
  xp: number;
  level: number;
  level_name: string;
  streak_weeks: number;
};

export type BuildingFacing = "left" | "right";

export type PlacedBuilding = {
  id: number;
  catalog_item_id: string;
  grid_x: number;
  grid_y: number;
  facing?: BuildingFacing;
  visual_variant?: number;
  purchase_price_coins: number;
  purchased_at: string;
  updated_at: string;
};

export type GameState = {
  wallet: GameWallet;
  progression: {
    current_level_xp: number;
    next_level_xp: number | null;
    progress_percent: number;
  };
  district: { min_x: number; max_x: number; min_y: number; max_y: number };
  infrastructure: {
    tier: "dirt" | "gravel" | "stone";
    reserved_cells: Array<{ x: number; y: number }>;
  };
  buildings: PlacedBuilding[];
};

export type GameReward = {
  id: number;
  plan_period_id: number | null;
  reward_type: string;
  coins_awarded: number;
  xp_awarded: number;
  previous_level: number;
  new_level: number;
  streak_weeks: number;
  explanation: string;
  created_at: string;
};

export type SimulatedWeek = {
  source: "live" | "fixture_fallback";
  replayed: boolean;
  evaluation: {
    id: number;
    period_start: string;
    period_end: string;
    planned_savings_cents: number;
    actual_net_savings_cents: number;
    planned_discretionary_spending_cents: number;
    actual_discretionary_spending_cents: number;
    savings_ratio_basis_points: number;
    adherence_tier: "within" | "moderate" | "substantial";
    exceptional_expense_flag: boolean;
    source: string;
    explanation: string;
    evaluated_at: string;
  };
  reward: GameReward;
  unlocks: {
    catalog_items: TownCatalogItem[];
    district: GameState["district"] | null;
    infrastructure: GameState["infrastructure"] | null;
  };
  game_state: GameState;
};
