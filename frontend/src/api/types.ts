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

export type Dashboard = {
  connection: BankConnection;
  summary: DashboardSummary;
  accounts: Account[];
  recent_transactions: Transaction[];
  spending_by_category: SpendingCategory[];
  forecast: null;
  active_goal: null;
};

export type Health = {
  status: string;
  data_mode: string;
  nessie_configured: boolean;
};
