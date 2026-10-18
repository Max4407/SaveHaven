import type { Dashboard } from "../../api/types";

export function buildBalanceHistory(
  dashboard: Dashboard,
  formatLabel: (date: string) => string = (date) => date,
) {
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
    return { date, label: formatLabel(date), balance };
  });
}
