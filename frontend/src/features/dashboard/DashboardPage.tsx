import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { isApiError } from "../../api/client";
import {
  acceptGoalPlan,
  connectBank,
  createGoal,
  getDashboard,
  getDemoProfiles,
  regenerateGoalPlan,
  syncBank,
} from "../../api/finance";
import type { Dashboard, Transaction } from "../../api/types";

function formatDollars(cents: number, options?: Intl.NumberFormatOptions) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
    ...options,
  }).format(cents / 100);
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(
    new Date(`${value}T00:00:00`),
  );
}

function formatDateTime(value: string | null) {
  if (!value) return "Not synced yet";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function titleCase(value: string) {
  return value.replace(/[-_]/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function buildBalanceHistory(dashboard: Dashboard) {
  const totalsByDate = new Map<string, number>();
  for (const transaction of dashboard.recent_transactions) {
    totalsByDate.set(
      transaction.occurred_at,
      (totalsByDate.get(transaction.occurred_at) ?? 0) + transaction.signed_amount_cents,
    );
  }

  const datedChanges = [...totalsByDate.entries()].sort(([left], [right]) =>
    left.localeCompare(right),
  );
  let balance = dashboard.summary.total_balance_cents
    - datedChanges.reduce((total, [, change]) => total + change, 0);

  return datedChanges.map(([date, change]) => {
    balance += change;
    return { date, label: formatDate(date), balance };
  });
}

function ConnectBankPanel() {
  const queryClient = useQueryClient();
  const [selectedProfileId, setSelectedProfileId] = useState("");
  const [consented, setConsented] = useState(false);
  const profilesQuery = useQuery({
    queryKey: ["demo-profiles"],
    queryFn: getDemoProfiles,
  });
  const connectMutation = useMutation({
    mutationFn: connectBank,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["dashboard"] }),
  });

  if (profilesQuery.isPending) {
    return <div className="route-loading inline-loading" role="status">Loading demo profiles…</div>;
  }

  if (profilesQuery.isError) {
    return (
      <section className="status-card embedded-status" role="alert">
        <h1>Demo profiles could not be loaded.</h1>
        <button className="secondary-button" type="button" onClick={() => profilesQuery.refetch()}>
          Try again
        </button>
      </section>
    );
  }

  const selectedId = selectedProfileId || profilesQuery.data[0]?.id || "";
  const selectedProfile = profilesQuery.data.find((profile) => profile.id === selectedId);
  const demoUsername = selectedProfile ? `${selectedProfile.id}@sandbox.demo` : "";

  return (
    <main className="onboarding-page">
      <header className="onboarding-heading">
        <span className="page-mark" aria-hidden="true">S</span>
        <div>
          <p className="eyebrow">Capital One Nessie sandbox</p>
          <h1>Connect a fictional bank profile.</h1>
          <p>These read-only credentials are presentation props. Only the selected profile ID is sent.</p>
        </div>
      </header>

      <form
        className="profile-grid"
        onSubmit={(event) => {
          event.preventDefault();
          if (selectedId) connectMutation.mutate(selectedId);
        }}
      >
        {profilesQuery.data.map((profile) => (
          <label
            className={`profile-card${selectedId === profile.id ? " selected" : ""}`}
            key={profile.id}
          >
            <input
              type="radio"
              name="demo-profile"
              value={profile.id}
              checked={selectedId === profile.id}
              onChange={() => setSelectedProfileId(profile.id)}
            />
            <span className="profile-check" aria-hidden="true">✓</span>
            <strong>{profile.display_name}</strong>
            <small>{profile.income_pattern}</small>
            <p>{profile.description}</p>
          </label>
        ))}

        <section className="sandbox-login" aria-label="Fictional sandbox credentials">
          <div>
            <label htmlFor="sandbox-username">Fictional username</label>
            <input id="sandbox-username" value={demoUsername} readOnly />
          </div>
          <div>
            <label htmlFor="sandbox-password">Fictional password</label>
            <input id="sandbox-password" value="savehaven-demo" type="password" readOnly />
          </div>
          <label className="consent-check">
            <input
              type="checkbox"
              checked={consented}
              onChange={(event) => setConsented(event.target.checked)}
            />
            I understand this connects only fictional Capital One Nessie sandbox data.
          </label>
        </section>

        {connectMutation.error ? (
          <p className="error-banner profile-error" role="alert">
            {isApiError(connectMutation.error)
              ? connectMutation.error.message
              : "The demo bank could not be connected."}
          </p>
        ) : null}

        <button
          className="primary-button connect-button"
          type="submit"
          disabled={!selectedId || !consented || connectMutation.isPending}
        >
          {connectMutation.isPending ? "Connecting…" : "Connect selected profile"}
        </button>
      </form>
    </main>
  );
}

function GoalPlanner({ dashboard }: { dashboard: Dashboard }) {
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(!dashboard.active_goal);
  const [name, setName] = useState("Emergency fund");
  const [targetAmount, setTargetAmount] = useState("3000");
  const [savedAmount, setSavedAmount] = useState("0");
  const defaultTarget = useMemo(() => {
    const target = new Date();
    target.setMonth(target.getMonth() + 6);
    return target.toISOString().slice(0, 10);
  }, []);
  const [targetDate, setTargetDate] = useState(defaultTarget);
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["dashboard"] });
  const createMutation = useMutation({
    mutationFn: createGoal,
    onSuccess: () => {
      setShowForm(false);
      refresh();
    },
  });
  const regenerateMutation = useMutation({ mutationFn: regenerateGoalPlan, onSuccess: refresh });
  const acceptMutation = useMutation({ mutationFn: acceptGoalPlan, onSuccess: refresh });
  const error = createMutation.error || regenerateMutation.error || acceptMutation.error;
  const goal = dashboard.active_goal;
  const plan = dashboard.current_plan;

  return (
    <section className="panel planner-panel" aria-labelledby="planner-heading">
      <div className="panel-heading">
        <div><p className="eyebrow">Nessie-powered recommendation</p><h2 id="planner-heading">Savings plan</h2></div>
        {goal && !showForm ? (
          <button className="text-button" type="button" onClick={() => setShowForm(true)}>Replace goal</button>
        ) : null}
      </div>

      {showForm ? (
        <form
          className="goal-form"
          onSubmit={(event) => {
            event.preventDefault();
            createMutation.mutate({
              name,
              target_amount_cents: Math.round(Number(targetAmount) * 100),
              amount_already_saved_cents: Math.round(Number(savedAmount) * 100),
              target_date: targetDate,
            });
          }}
        >
          <label>Goal name<input required value={name} onChange={(event) => setName(event.target.value)} /></label>
          <label>Target amount<input required min="1" step="1" type="number" value={targetAmount} onChange={(event) => setTargetAmount(event.target.value)} /></label>
          <label>Already saved<input required min="0" step="1" type="number" value={savedAmount} onChange={(event) => setSavedAmount(event.target.value)} /></label>
          <label>Target date<input required type="date" value={targetDate} onChange={(event) => setTargetDate(event.target.value)} /></label>
          <button className="primary-button" disabled={createMutation.isPending} type="submit">
            {createMutation.isPending ? "Calculating…" : "Generate recommendation"}
          </button>
        </form>
      ) : goal && plan ? (
        <div className="plan-result">
          <div className="goal-title-row">
            <div><strong>{goal.name}</strong><small>{formatDollars(goal.amount_already_saved_cents)} of {formatDollars(goal.target_amount_cents)} saved</small></div>
            <span className={`plan-status ${plan.status}`}>{titleCase(plan.status)}</span>
          </div>
          <div className="plan-metrics">
            <span><small>Save weekly</small><strong>{formatDollars(plan.weekly_savings_cents)}</strong></span>
            <span><small>Safe to spend</small><strong>{formatDollars(plan.safe_to_spend_cents)}</strong></span>
            <span><small>Income signal</small><strong>{titleCase(plan.income_cadence)}</strong></span>
          </div>
          {!plan.feasible ? (
            <p className="fallback-warning">This target is not feasible with the current cash flow. {plan.suggested_target_date ? `Suggested date: ${formatDate(plan.suggested_target_date)}.` : "No positive weekly capacity is available yet."}</p>
          ) : null}
          <p className="plan-explanation">{plan.explanation}</p>
          <ul className="evidence-list">{plan.evidence.map((item) => <li key={item}>{item}</li>)}</ul>
          {plan.status === "draft" ? (
            <div className="plan-actions">
              <button className="secondary-button" type="button" disabled={regenerateMutation.isPending} onClick={() => regenerateMutation.mutate(goal.id)}>Recalculate from latest sync</button>
              <button className="primary-button" type="button" disabled={acceptMutation.isPending} onClick={() => acceptMutation.mutate(goal.id)}>{acceptMutation.isPending ? "Accepting…" : "Accept this plan"}</button>
            </div>
          ) : <p className="accepted-note">Accepted recommendations stay fixed when later sandbox events arrive.</p>}
        </div>
      ) : null}
      {error ? <p className="error-banner" role="alert">{isApiError(error) ? error.message : "The savings plan could not be updated."}</p> : null}
    </section>
  );
}

function TransactionRow({ transaction }: { transaction: Transaction }) {
  const transactionName = transaction.merchant_name || transaction.description || titleCase(transaction.kind);
  return (
    <li className="transaction-row">
      <span className={`transaction-direction ${transaction.direction}`} aria-hidden="true">
        {transaction.direction === "inflow" ? "↓" : "↑"}
      </span>
      <span>
        <strong>{transactionName}</strong>
        <small>{formatDate(transaction.occurred_at)} · {titleCase(transaction.category)}</small>
      </span>
      <strong className={transaction.signed_amount_cents >= 0 ? "positive-amount" : ""}>
        {formatDollars(transaction.signed_amount_cents, { maximumFractionDigits: 2 })}
      </strong>
    </li>
  );
}

function ConnectedDashboard({ dashboard }: { dashboard: Dashboard }) {
  const queryClient = useQueryClient();
  const balanceHistory = useMemo(() => buildBalanceHistory(dashboard), [dashboard]);
  const syncMutation = useMutation({
    mutationFn: syncBank,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["dashboard"] }),
  });
  const largestCategory = dashboard.spending_by_category[0];

  return (
    <main className="dashboard-page">
      <header className="topbar">
        <div className="page-heading">
          <span className="page-mark" aria-hidden="true">S</span>
          <div>
            <p className="eyebrow">Bank overview</p>
            <h1>Your money, at a glance.</h1>
            <p>Updated through {formatDate(dashboard.summary.as_of)} for {dashboard.connection.display_name}.</p>
          </div>
        </div>
        <div className="topbar-actions">
          <span className={`sandbox-pill ${dashboard.connection.data_source}`}><span /> {dashboard.connection.data_source === "live" ? "Live Nessie Sandbox" : "Fixture fallback"}</span>
          <button
            className="secondary-button"
            type="button"
            disabled={syncMutation.isPending}
            onClick={() => syncMutation.mutate()}
          >
            {syncMutation.isPending ? "Syncing…" : "Sync data"}
          </button>
        </div>
      </header>

      {syncMutation.error ? (
        <p className="error-banner dashboard-error" role="alert">
          {isApiError(syncMutation.error) ? syncMutation.error.message : "The bank sync failed."}
        </p>
      ) : null}

      {dashboard.connection.data_source !== "live" ? (
        <p className="fallback-warning" role="status"><strong>Fixture fallback:</strong> Nessie was unavailable or live mode is not enabled. This data is fictional local fallback data, not a live sandbox sync.</p>
      ) : null}

      <section className="import-strip" aria-label="Nessie import provenance">
        <span><small>Last sync</small><strong>{formatDateTime(dashboard.connection.last_synced_at)}</strong></span>
        <span><small>Accounts imported</small><strong>{dashboard.import_summary.account_count}</strong></span>
        <span><small>Transactions imported</small><strong>{dashboard.import_summary.transaction_count}</strong></span>
        <span><small>Resources represented</small><strong>{dashboard.import_summary.transaction_types.map(titleCase).join(", ") || "None"}</strong></span>
      </section>

      <section className="stat-grid" aria-label="Financial summary">
        <article className="stat-card accent-blue">
          <span className="stat-icon" aria-hidden="true">$</span>
          <p>Total balance</p>
          <h2>{formatDollars(dashboard.summary.total_balance_cents)}</h2>
          <small>Across {dashboard.accounts.length} connected accounts</small>
        </article>
        <article className="stat-card accent-green">
          <span className="stat-icon" aria-hidden="true">↗</span>
          <p>Income · 30 days</p>
          <h2>{formatDollars(dashboard.summary.income_last_30_days_cents)}</h2>
          <small>Transfers excluded</small>
        </article>
        <article className="stat-card accent-gold">
          <span className="stat-icon" aria-hidden="true">↘</span>
          <p>Spending · 30 days</p>
          <h2>{formatDollars(dashboard.summary.spending_last_30_days_cents)}</h2>
          <small>{largestCategory ? `${titleCase(largestCategory.category)} is the largest category` : "No spending recorded"}</small>
        </article>
      </section>

      <section className="panel money-history-panel" aria-label="Money over time">
        <div className="panel-heading money-history-heading">
          <div>
            <p className="eyebrow">Imported activity</p>
            <h2>Balance history</h2>
          </div>
          <div className="balance-change">
            <strong>{formatDollars(dashboard.summary.savings_balance_cents)}</strong>
            <span>currently in savings</span>
          </div>
        </div>

        {balanceHistory.length > 0 ? (
          <div className="money-chart" aria-label="Balance history from imported transactions">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={balanceHistory} margin={{ top: 24, right: 16, left: 8, bottom: 0 }}>
                <defs>
                  <linearGradient id="balanceFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#4d8a6a" stopOpacity={0.3} />
                    <stop offset="100%" stopColor="#4d8a6a" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="#e5e7df" strokeDasharray="3 5" vertical={false} />
                <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fill: "#7b7d75", fontSize: 11 }} />
                <YAxis
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: "#7b7d75", fontSize: 11 }}
                  tickFormatter={(value) => `$${Math.round(Number(value) / 100000)}k`}
                  width={48}
                />
                <Tooltip
                  formatter={(value) => [formatDollars(Number(value)), "Balance"]}
                  labelFormatter={(_label, entries) => {
                    const date = entries[0]?.payload?.date as string | undefined;
                    return date ? formatDate(date) : "";
                  }}
                  contentStyle={{ borderRadius: 10, border: "1px solid #dfe2d9", boxShadow: "0 12px 30px rgba(31,44,38,.1)" }}
                />
                <Area
                  type="monotone"
                  dataKey="balance"
                  stroke="#356b4d"
                  fill="url(#balanceFill)"
                  strokeWidth={3}
                  activeDot={{ r: 5, fill: "#356b4d", stroke: "#fbfcf8", strokeWidth: 3 }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        ) : <p className="empty-state">No imported activity yet.</p>}
      </section>

      <GoalPlanner dashboard={dashboard} />

      <div className="dashboard-detail-grid">
        <section className="panel" aria-labelledby="accounts-heading">
          <div className="panel-heading">
            <div><p className="eyebrow">Connected accounts</p><h2 id="accounts-heading">Balances</h2></div>
          </div>
          <ul className="account-list">
            {dashboard.accounts.map((account) => (
              <li key={account.source_account_id}>
                <span><strong>{account.nickname}</strong><small>{titleCase(account.account_type)}</small></span>
                <strong>{formatDollars(account.balance_cents, { maximumFractionDigits: 2 })}</strong>
              </li>
            ))}
          </ul>
        </section>

        <section className="panel" aria-labelledby="spending-heading">
          <div className="panel-heading">
            <div><p className="eyebrow">Last 30 days</p><h2 id="spending-heading">Spending by category</h2></div>
          </div>
          {dashboard.spending_by_category.length > 0 ? (
            <ul className="category-list">
              {dashboard.spending_by_category.map((category) => {
                const width = dashboard.summary.spending_last_30_days_cents === 0
                  ? 0
                  : Math.round(category.amount_cents / dashboard.summary.spending_last_30_days_cents * 100);
                return (
                  <li key={category.category}>
                    <span><strong>{titleCase(category.category)}</strong><small>{formatDollars(category.amount_cents, { maximumFractionDigits: 2 })}</small></span>
                    <span className="spend-track"><span style={{ width: `${width}%` }} /></span>
                  </li>
                );
              })}
            </ul>
          ) : <p className="empty-state">No spending recorded in this period.</p>}
        </section>
      </div>

      <section className="panel transactions-panel" aria-labelledby="transactions-heading">
        <div className="panel-heading">
          <div><p className="eyebrow">Normalized ledger</p><h2 id="transactions-heading">Recent transactions</h2></div>
          <span className="record-count">{dashboard.recent_transactions.length} records</span>
        </div>
        {dashboard.recent_transactions.length > 0 ? (
          <ul className="transaction-list">
            {dashboard.recent_transactions.map((transaction) => (
              <TransactionRow transaction={transaction} key={transaction.source_id} />
            ))}
          </ul>
        ) : <p className="empty-state">No transactions have been imported.</p>}
      </section>

      <footer>
        <span>Educational demo only — not financial advice.</span>
        <span>All banking data shown is fictional.</span>
      </footer>
    </main>
  );
}

export function DashboardPage() {
  const dashboardQuery = useQuery({
    queryKey: ["dashboard"],
    queryFn: getDashboard,
    retry: (failureCount, error) => !isApiError(error, 409) && failureCount < 1,
  });

  if (dashboardQuery.isPending) {
    return <div className="route-loading" role="status">Loading your financial snapshot…</div>;
  }

  if (dashboardQuery.isError && isApiError(dashboardQuery.error, 409)) {
    return <ConnectBankPanel />;
  }

  if (dashboardQuery.isError) {
    return (
      <main className="status-page">
        <section className="status-card" role="alert">
          <p className="eyebrow">Dashboard unavailable</p>
          <h1>Your financial snapshot could not be loaded.</h1>
          <p>{isApiError(dashboardQuery.error) ? dashboardQuery.error.message : "Please try again."}</p>
          <button className="primary-button" type="button" onClick={() => dashboardQuery.refetch()}>
            Try again
          </button>
        </section>
      </main>
    );
  }

  return <ConnectedDashboard dashboard={dashboardQuery.data} />;
}
