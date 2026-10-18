import type { SavingsGoal } from "../../api/types";

const dayNumber = (date: Date) => Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86400000;

export function goalJourney(goal: SavingsGoal, now = new Date()) {
  const today = dayNumber(now);
  const target = Date.parse(goal.target_date) / 86400000;
  const created = goal.created_at;
  const timestamp = created && !/(Z|[+-]\d{2}:?\d{2})$/i.test(created) ? `${created}Z` : created;
  const start = timestamp ? dayNumber(new Date(timestamp)) : NaN;
  const hasStart = Number.isFinite(start) && start <= today;
  const elapsed = hasStart ? Math.max(0, today - start) : 0;
  const ratio = goal.target_amount_cents > 0 ? goal.amount_already_saved_cents / goal.target_amount_cents : 0;
  const complete = ratio >= 1;
  const nextMilestone = [25, 50, 75, 100].find((percent) => ratio * 100 < percent) ?? 100;
  return {
    week: hasStart ? Math.floor(elapsed / 7) + 1 : null,
    day: hasStart ? elapsed % 7 + 1 : null,
    totalWeeks: hasStart ? Math.max(1, Math.ceil((target - start) / 7)) : null,
    daysLeft: Math.max(0, target - today),
    overdue: target < today && !complete,
    complete,
    ratio,
    nextMilestone,
    toNextMilestone: Math.max(0, Math.ceil(goal.target_amount_cents * nextMilestone / 100) - goal.amount_already_saved_cents),
  };
}
