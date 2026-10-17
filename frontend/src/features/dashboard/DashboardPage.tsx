import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { isApiError } from "../../api/client";
import {
  connectBank,
  getDashboard,
  getDemoProfiles,
  syncBank,
} from "../../api/finance";
import type { Dashboard, Transaction } from "../../api/types";

const demoSavingsGoals = [
  { id: "car-fund", name: "Car fund", targetCents: 2_000_000, mark: "C" },
  { id: "emergency-cushion", name: "Emergency cushion", targetCents: 1_000_000, mark: "E" },
] as const;

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

  return (
    <main className="onboarding-page">
      <header className="onboarding-heading">
        <Link className="route-arrow" to="/town" aria-label="Back to town">
          <span aria-hidden="true">←</span>
        </Link>
        <span className="page-mark" aria-hidden="true">S</span>
        <div>
          <p className="eyebrow">Connect a demo bank</p>
          <h1>Choose a fictional financial story.</h1>
          <p>No credentials or real account information are collected.</p>
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
          disabled={!selectedId || connectMutation.isPending}
        >
          {connectMutation.isPending ? "Connecting…" : "Connect selected profile"}
        </button>
      </form>
    </main>
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
  return (
    <main className="dashboard-page bank-page">
      <header className="topbar bank-topbar">
        <div className="page-heading">
          <Link className="route-arrow" to="/town" aria-label="Back to town">
            <span aria-hidden="true">←</span>
          </Link>
          <div>
            <p className="eyebrow">SaveHaven finances</p>
            <h1>Bank</h1>
            <p>Updated {formatDate(dashboard.summary.as_of)}</p>
          </div>
        </div>
        <div className="topbar-actions">
          <span className="sandbox-pill"><span /> Demo data</span>
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

      <section className="stat-grid bank-summary-grid" aria-label="Financial summary">
        <article className="stat-card">
          <p>Total balance</p>
          <h2>{formatDollars(dashboard.summary.total_balance_cents)}</h2>
          <small>Across connected accounts</small>
        </article>
        <article className="stat-card">
          <p>Spending · 30 days</p>
          <h2>{formatDollars(dashboard.summary.spending_last_30_days_cents)}</h2>
          <small>Recent outflow</small>
        </article>
      </section>

      <section className="bank-goals-section" aria-labelledby="savings-goals-heading">
        <div className="bank-section-heading">
          <div>
            <p className="eyebrow">Milestones</p>
            <h2 id="savings-goals-heading">Savings goals</h2>
          </div>
          <span>{demoSavingsGoals.length} demo goals</span>
        </div>
        <div className="bank-goal-grid">
          {demoSavingsGoals.map((goal) => {
            const progress = Math.min(
              100,
              Math.round(dashboard.summary.savings_balance_cents / goal.targetCents * 100),
            );
            return (
              <article className="bank-goal-card" key={goal.id}>
                <div className="bank-goal-title">
                  <span aria-hidden="true">{goal.mark}</span>
                  <h3>{goal.name}</h3>
                </div>
                <p>
                  <strong>{formatDollars(dashboard.summary.savings_balance_cents)}</strong>
                  <span> of {formatDollars(goal.targetCents)}</span>
                </p>
                <div
                  className="bank-goal-progress"
                  role="progressbar"
                  aria-label={`${goal.name} progress`}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={progress}
                >
                  <span style={{ width: `${progress}%` }} />
                </div>
                <small>{progress}% complete · Based on current savings</small>
              </article>
            );
          })}
        </div>
      </section>

      <section className="panel money-history-panel" aria-label="Money over time">
        <div className="panel-heading money-history-heading">
          <div>
            <p className="eyebrow">Recent activity</p>
            <h2>Money over time</h2>
          </div>
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

      <section className="panel transactions-panel bank-transactions-panel" aria-labelledby="transactions-heading">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Past activity</p>
            <h2 id="transactions-heading">Transactions</h2>
          </div>
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
