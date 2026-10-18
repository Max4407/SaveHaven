import { describe, expect, it } from "vitest";
import type { Dashboard } from "../../api/types";
import { buildBalanceHistory } from "./balanceHistory";

function dashboardWithHistory(
  totalBalanceCents: number,
  changes: Array<[string, number]>,
) {
  return {
    summary: { total_balance_cents: totalBalanceCents },
    recent_transactions: changes.map(([occurredAt, signedAmount], index) => ({
      occurred_at: occurredAt,
      signed_amount_cents: signedAmount,
      source_id: `transaction-${index}`,
    })),
  } as Dashboard;
}

describe("buildBalanceHistory", () => {
  it("keeps earlier balances fixed when a later week and its balance change arrive", () => {
    const before = buildBalanceHistory(
      dashboardWithHistory(100_000, [
        ["2026-10-01", 10_000],
        ["2026-10-03", -2_000],
      ]),
    );
    const after = buildBalanceHistory(
      dashboardWithHistory(104_000, [
        ["2026-10-01", 10_000],
        ["2026-10-03", -2_000],
        ["2026-10-10", 4_000],
      ]),
    );

    expect(after.slice(0, before.length)).toEqual(before);
    expect(after.at(-1)?.balance).toBe(104_000);
  });
});
