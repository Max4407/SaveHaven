import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { isApiError } from "../../api/client";
import { getDashboard, getHealth, runNessieEvent } from "../../api/finance";
import type { NessieEventType } from "../../api/types";

const eventOptions: Array<{
  type: NessieEventType;
  title: string;
  description: string;
  defaultAmount: number;
}> = [
  { type: "paycheck", title: "Receive paycheck", description: "Create a Nessie checking deposit.", defaultAmount: 1850 },
  { type: "planned_purchase", title: "Make planned purchase", description: "Create a categorized planned withdrawal.", defaultAmount: 45 },
  { type: "unplanned_purchase", title: "Make unplanned purchase", description: "Create a discretionary withdrawal.", defaultAmount: 150 },
  { type: "move_to_savings", title: "Move money to savings", description: "Create paired checking and savings records.", defaultAmount: 200 },
];

function formatDollars(cents: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(cents / 100);
}

function eventKey() {
  return crypto.randomUUID().toLowerCase();
}

function EventCard({ option, enabled }: { option: typeof eventOptions[number]; enabled: boolean }) {
  const queryClient = useQueryClient();
  const [amount, setAmount] = useState(String(option.defaultAmount));
  const [idempotencyKey, setIdempotencyKey] = useState(eventKey);
  const mutation = useMutation({
    mutationFn: runNessieEvent,
    onSuccess: (result) => {
      queryClient.setQueryData(["dashboard"], result.dashboard);
      setIdempotencyKey(eventKey());
    },
  });
  const amountCents = Math.round(Number(amount) * 100);
  const importedTransactions = mutation.data?.dashboard.recent_transactions.filter(
    (transaction) => Math.abs(transaction.signed_amount_cents) === amountCents,
  ).slice(0, option.type === "move_to_savings" ? 2 : 1) ?? [];

  return (
    <article className="lab-event-card">
      <p className="eyebrow">{option.type.replaceAll("_", " ")}</p>
      <h2>{option.title}</h2>
      <p>{option.description}</p>
      <label>
        Whole-dollar amount
        <span className="amount-input"><span>$</span><input min="1" max="10000" step="1" type="number" value={amount} onChange={(event) => { setAmount(event.target.value); setIdempotencyKey(eventKey()); }} /></span>
      </label>
      <button
        className="primary-button"
        disabled={!enabled || mutation.isPending}
        type="button"
        onClick={() => mutation.mutate({
          event_type: option.type,
          amount_cents: amountCents,
          idempotency_key: idempotencyKey,
        })}
      >
        {mutation.isPending ? "Writing to Nessie…" : "Run sandbox event"}
      </button>
      {mutation.isSuccess ? (
        <div className="event-result" role="status">
          <p className="event-success">Synced. Created {mutation.data.created_records.length}; reused {mutation.data.reused_records.length}.</p>
          <div className="event-balances">
            {mutation.data.dashboard.accounts.map((account) => (
              <span key={account.source_account_id}><small>{account.nickname}</small><strong>{formatDollars(account.balance_cents)}</strong></span>
            ))}
          </div>
          {importedTransactions.map((transaction) => (
            <p className="imported-event" key={transaction.source_id}>
              Imported {transaction.merchant_name || transaction.description}: <strong>{formatDollars(transaction.signed_amount_cents)}</strong>
            </p>
          ))}
        </div>
      ) : null}
      {mutation.error ? <p className="error-banner" role="alert">{isApiError(mutation.error) ? mutation.error.message : "The Nessie event failed."}</p> : null}
    </article>
  );
}

export default function NessieLabPage() {
  const healthQuery = useQuery({ queryKey: ["health"], queryFn: getHealth });
  const dashboardQuery = useQuery({ queryKey: ["dashboard"], queryFn: getDashboard, retry: false });
  const controlsEnabled = healthQuery.data?.demo_controls_enabled === true;
  const live = dashboardQuery.data?.connection.data_source === "live";
  const ready = controlsEnabled && live;

  return (
    <main className="dashboard-page lab-page">
      <header className="topbar">
        <div className="page-heading">
          <span className="page-mark" aria-hidden="true">N</span>
          <div><p className="eyebrow">Developer demonstration</p><h1>Nessie Lab</h1><p>Create fictional sandbox events, then inspect the imported result.</p></div>
        </div>
        <span className={`sandbox-pill ${live ? "live" : "fixture"}`}><span /> {live ? "Live Nessie Sandbox" : "Live connection required"}</span>
      </header>

      {!controlsEnabled && !healthQuery.isPending ? (
        <p className="fallback-warning" role="alert">Nessie Lab is disabled in this environment. Set <code>DEMO_CONTROLS_ENABLED=true</code> for the judge demo.</p>
      ) : null}
      {controlsEnabled && !live && !dashboardQuery.isPending ? (
        <p className="fallback-warning" role="alert">Connect and successfully sync a live Nessie profile before creating events.</p>
      ) : null}

      <section className="lab-event-grid" aria-label="Nessie sandbox events">
        {eventOptions.map((option) => <EventCard key={option.type} option={option} enabled={ready} />)}
      </section>

      <section className="panel technical-panel">
        <p className="eyebrow">Technical proof</p>
        <h2>Nessie resources used</h2>
        <p>The backend is the only Nessie caller. Sync reads and normalizes the sandbox resources below; lab actions write deposits and withdrawals, including paired records for transfers.</p>
        <div className="resource-chips">
          {["customers", "accounts", "deposits", "withdrawals", "purchases", "transfers", "bills"].map((resource) => <code key={resource}>/{resource}</code>)}
        </div>
      </section>
    </main>
  );
}
