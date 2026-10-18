import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useRef, useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  Pie,
  PieChart,
  Sector,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { CSSProperties } from "react";
import type { PieSectorShapeProps } from "recharts";
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
import { LastRefreshed } from "../../components/LastRefreshed";
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
        <h2 id="planner-heading">Savings plan</h2>
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
  const [showAllTransactions, setShowAllTransactions] = useState(false);
  const [transactionFilter, setTransactionFilter] = useState<"all" | "spending" | "income">("all");
  const [spendingCategory, setSpendingCategory] = useState<string | null>(null);
  const categoryColors = ["#357955", "#c49439", "#668fb0", "#b76f61", "#8b78a8", "#5e9d99", "#b883a0", "#839447"];
  const spendingSlices = dashboard.spending_by_category.filter((item) => item.amount_cents > 0).map((item, index) => ({ ...item, name: titleCase(item.category), fill: categoryColors[index % categoryColors.length] }));
  const highlightedCategory = transactionFilter === "spending" ? spendingCategory : null;
  const selectedSlice = spendingSlices.find((item) => item.category === highlightedCategory);
  const spendingTotal = spendingSlices.reduce((total, item) => total + item.amount_cents, 0);
  const transactionHeading = useRef<HTMLHeadingElement>(null);
  const filteredTransactions = dashboard.recent_transactions.filter((transaction) => {
    if (transactionFilter === "all") return true;
    const daysAgo = (Date.parse(dashboard.summary.as_of) - Date.parse(transaction.occurred_at)) / 86400000;
    return daysAgo >= 0 && daysAgo < 30 && transaction.kind !== "transfer"
      && (transactionFilter === "income" ? transaction.signed_amount_cents > 0 : transaction.signed_amount_cents < 0 && (!spendingCategory || transaction.category === spendingCategory));
  });
  const visibleTransactions = showAllTransactions ? filteredTransactions : filteredTransactions.slice(0, 5);
  const openTransactions = (filter: "spending" | "income", category: string | null = null, jumpToList = category === null) => {
    const nextCategory = category && category === spendingCategory && filter === transactionFilter && !jumpToList ? null : category;
    setSpendingCategory(nextCategory);
    setTransactionFilter(filter);
    setShowAllTransactions(true);
    if (jumpToList) {
      transactionHeading.current?.focus({ preventScroll: true });
      transactionHeading.current?.scrollIntoView?.({ block: "start", behavior: "smooth" });
    }
  };
  const queryClient = useQueryClient();
  const balanceHistory = useMemo(() => buildBalanceHistory(dashboard), [dashboard]);
  const activeGoal = dashboard.active_goal;
  const activeGoalProgress = activeGoal
    ? Math.min(100, Math.round(
      activeGoal.amount_already_saved_cents / activeGoal.target_amount_cents * 100,
    ))
    : 0;
  const syncMutation = useMutation({
    mutationFn: syncBank,
    onSuccess: async (connection) => {
      queryClient.setQueryData<Dashboard>(["dashboard"], (current) =>
        current ? { ...current, connection } : current,
      );
      await queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });
  return (
    <main className="dashboard-page bank-page">
      <header className="topbar bank-topbar">
        <div className="page-heading">
          <div>
            <h1>Bank</h1>
            <p>Updated {formatDate(dashboard.summary.as_of)}</p>
          </div>
        </div>
        <div className="topbar-actions">
          <span className={`sandbox-pill ${dashboard.connection.data_source}`}><span /> {dashboard.connection.data_source === "live" ? "Live Nessie Sandbox" : "Fixture fallback"}</span>
          <div className="bank-refresh-controls">
            <LastRefreshed timestamp={dashboard.connection.last_synced_at} />
            <button
              className="secondary-button bank-refresh-button"
              type="button"
              disabled={syncMutation.isPending}
              aria-label={syncMutation.isPending ? "Refreshing data" : "Refresh data"}
              title={syncMutation.isPending ? "Refreshing…" : "Refresh data"}
              aria-busy={syncMutation.isPending}
              onClick={() => syncMutation.mutate()}
            >
              <span aria-hidden="true">↻</span>
            </button>
          </div>
        </div>
      </header>

      {syncMutation.error ? (
        <p className="error-banner dashboard-error" role="alert">
          {isApiError(syncMutation.error) ? syncMutation.error.message : "The bank refresh failed. Please try again."}
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

      <section className="stat-grid bank-summary-grid" aria-label="Financial summary">
        <article className="stat-card">
          <p>Total balance</p>
          <h2>{formatDollars(dashboard.summary.total_balance_cents)}</h2>
          <small>Across connected accounts</small>
        </article>
        <button className="stat-card finance-summary-button" type="button" onClick={() => openTransactions("income")} aria-controls="bank-transactions">
          <p>Income · 30 days</p>
          <h2>{formatDollars(dashboard.summary.income_last_30_days_cents)}</h2>
          <small>View income <span aria-hidden="true">→</span></small>
        </button>
        <button className="stat-card finance-summary-button" type="button" onClick={() => openTransactions("spending")} aria-controls="bank-transactions">
          <p>Spending · 30 days</p>
          <h2>{formatDollars(dashboard.summary.spending_last_30_days_cents)}</h2>
          <small>View spending <span aria-hidden="true">→</span></small>
        </button>
      </section>

      <section className="panel spending-pie-panel" aria-labelledby="spending-pie-heading">
        <div className="panel-heading">
          <h2 id="spending-pie-heading">Where your money goes</h2>
          {transactionFilter === "spending" && spendingCategory ? (
            <button className="secondary-button" type="button" onClick={() => openTransactions("spending", null, false)}>Show total</button>
          ) : null}
        </div>
        <p className="spending-pie-hint">Choose a slice or category to see its transactions.</p>
        {spendingSlices.length > 0 ? (
          <div className="spending-pie-layout">
            <div className="spending-pie-chart" role="img" aria-label="Spending by category. Use the category buttons to explore transactions.">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={spendingSlices} dataKey="amount_cents" nameKey="name" cx="50%" cy="50%" innerRadius="53%" outerRadius="78%" paddingAngle={3} cornerRadius={5} stroke="#fff4d1" strokeWidth={2} isAnimationActive={false}
                    onClick={(_entry, index) => openTransactions("spending", spendingSlices[index].category)}
                    shape={(props: PieSectorShapeProps) => {
                      const category = spendingSlices[props.index]?.category;
                      const selected = transactionFilter === "spending" && category === spendingCategory;
                      const angle = -(props.midAngle ?? 0) * Math.PI / 180;
                      const distance = 6;
                      return (
                        <g className={`spending-pie-slice${selected ? " selected" : ""}`} style={{ "--slice-x": `${Math.cos(angle) * distance}px`, "--slice-y": `${Math.sin(angle) * distance}px` } as CSSProperties}>
                          <Sector {...props} stroke={selected ? "#fffbea" : "#fff4d1"} strokeWidth={selected ? 3 : 2} />
                        </g>
                      );
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div className="donut-center" aria-hidden="true"><small>{selectedSlice ? selectedSlice.name : "Total spent"}</small><strong>{formatDollars(selectedSlice?.amount_cents ?? spendingTotal)}</strong><span>{selectedSlice ? `${Math.round(selectedSlice.amount_cents / spendingTotal * 100)}% of total` : "Last 30 days"}</span></div>
            </div>
            <div className="spending-category-list" role="group" aria-label="Spending categories">
              {spendingSlices.map((item) => (
                <button key={item.category} type="button" aria-pressed={transactionFilter === "spending" && spendingCategory === item.category} onClick={() => openTransactions("spending", item.category)} aria-controls="bank-transactions">
                  <span className="category-color" style={{ background: item.fill }} aria-hidden="true" />
                  <span>{item.name}<small>{Math.round(item.amount_cents / spendingTotal * 100)}% of spending</small></span>
                  <strong>{formatDollars(item.amount_cents, { maximumFractionDigits: 2 })}</strong>
                  <span aria-hidden="true">→</span>
                </button>
              ))}
            </div>
          </div>
        ) : <p className="empty-state">No spending recorded in the last 30 days.</p>}
        {spendingSlices.length > 0 ? (
          <div className="pie-selection-summary">
            <div><small>{selectedSlice ? selectedSlice.name : "Total spending"}</small><strong>{formatDollars(selectedSlice?.amount_cents ?? spendingTotal, { maximumFractionDigits: 2 })}</strong><span>{selectedSlice ? `${Math.round(selectedSlice.amount_cents / spendingTotal * 100)}% of your spending` : "Explore a category above"}</span></div>
            {transactionFilter === "spending" && spendingCategory ? (
              <button className="secondary-button" type="button" onClick={() => openTransactions("spending", spendingCategory, true)}>View {titleCase(spendingCategory)} transactions →</button>
            ) : null}
          </div>
        ) : null}
      </section>

      <section className="bank-goals-section" aria-labelledby="savings-goals-heading">
        <div className="bank-section-heading">
          <h2 id="savings-goals-heading">Savings goals</h2>
          <span>{activeGoal ? "1 active goal" : "No active goal"}</span>
        </div>
        <div className="bank-goal-grid">
          {activeGoal ? (
            <article className="bank-goal-card" key={activeGoal.id}>
              <div className="bank-goal-title">
                <span aria-hidden="true">{activeGoal.name.slice(0, 1).toUpperCase()}</span>
                <h3>{activeGoal.name}</h3>
              </div>
              <p>
                <strong>{formatDollars(activeGoal.amount_already_saved_cents)}</strong>
                <span> of {formatDollars(activeGoal.target_amount_cents)}</span>
              </p>
              <div
                className="bank-goal-progress"
                role="progressbar"
                aria-label={`${activeGoal.name} progress`}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={activeGoalProgress}
              >
                <span style={{ width: `${activeGoalProgress}%` }} />
              </div>
              <small>{activeGoalProgress}% complete · Target {formatDate(activeGoal.target_date)}</small>
            </article>
          ) : (
            <p className="empty-state">Create a savings goal below.</p>
          )}
        </div>
      </section>

      <section className="panel money-history-panel" aria-label="Money over time">
        <div className="panel-heading money-history-heading">
          <h2>Money over time</h2>
          <div className="balance-change">
            <strong>{formatDollars(dashboard.summary.savings_balance_cents)}</strong>
            <span>in savings</span>
          </div>
        </div>

        {balanceHistory.length > 0 ? (
          <div className="money-chart" aria-label="Balance history from imported transactions">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={balanceHistory} margin={{ top: 24, right: 16, left: 8, bottom: 0 }}>
                <CartesianGrid stroke="#c7b77a" strokeDasharray="4 4" vertical={false} />
                <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fill: "#685b3d", fontSize: 11 }} />
                <YAxis
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: "#685b3d", fontSize: 11 }}
                  tickFormatter={(value) => `$${Math.round(Number(value) / 100000)}k`}
                  width={48}
                />
                <Tooltip
                  formatter={(value) => [formatDollars(Number(value)), "Balance"]}
                  labelFormatter={(_label, entries) => {
                    const date = entries[0]?.payload?.date as string | undefined;
                    return date ? formatDate(date) : "";
                  }}
                  contentStyle={{ borderRadius: 0, border: "2px solid #9d7e43", boxShadow: "3px 3px 0 rgba(94,72,34,.28)" }}
                />
                <Line
                  type="linear"
                  dataKey="balance"
                  stroke="#175c32"
                  strokeWidth={3}
                  dot={{ r: 4, fill: "#e6c766", stroke: "#175c32", strokeWidth: 2 }}
                  activeDot={{ r: 6, fill: "#f0c75b", stroke: "#175c32", strokeWidth: 3 }}
                  isAnimationActive={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        ) : <p className="empty-state">No imported activity yet.</p>}
      </section>

      <GoalPlanner dashboard={dashboard} />

      <section id="bank-transactions" className="panel transactions-panel bank-transactions-panel" aria-labelledby="transactions-heading">
        <div className="panel-heading">
          <h2 id="transactions-heading" ref={transactionHeading} tabIndex={-1}>{transactionFilter === "all" ? "Transactions" : transactionFilter === "income" ? "Income transactions" : spendingCategory ? `${titleCase(spendingCategory)} transactions` : "Spending transactions"}</h2>
          <div className="transaction-actions">
            <span className="record-count">{filteredTransactions.length} records</span>
            {filteredTransactions.length > 5 ? (
              <button className="secondary-button transaction-toggle" type="button" aria-expanded={showAllTransactions} aria-controls="bank-transaction-list" onClick={() => setShowAllTransactions((current) => !current)}>
                {showAllTransactions ? "Show less" : `View all (${filteredTransactions.length})`}
              </button>
            ) : null}
          </div>
        </div>
        <div className="transaction-filters" role="group" aria-label="Filter transactions">
          {(["all", "spending", "income"] as const).map((filter) => (
            <button key={filter} type="button" aria-pressed={transactionFilter === filter} onClick={() => { setSpendingCategory(null); setTransactionFilter(filter); setShowAllTransactions(filter !== "all"); }}>
              {titleCase(filter)}
            </button>
          ))}
        </div>
        {transactionFilter !== "all" ? <p className="transaction-count-note">Last 30 days · Transfers between accounts excluded</p> : null}
        {filteredTransactions.length > 0 ? (
          <ul id="bank-transaction-list" className={`transaction-list${showAllTransactions ? " transaction-list-expanded" : ""}`}>
            {visibleTransactions.map((transaction) => (
              <TransactionRow transaction={transaction} key={transaction.source_id} />
            ))}
          </ul>
        ) : <p className="empty-state">No {transactionFilter === "all" ? "transactions have been imported" : `${spendingCategory ? titleCase(spendingCategory) + " " : ""}${transactionFilter} transactions in this period`}.</p>}
        {filteredTransactions.length > 5 ? (
          <p className="transaction-count-note">Showing {visibleTransactions.length} of {filteredTransactions.length} recent transactions</p>
        ) : null}
      </section>

      <footer>
        <span>Fictional demo data · Educational use only</span>
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
