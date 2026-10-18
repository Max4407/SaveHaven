import { describe, expect, it } from "vitest";
import { goalJourney } from "../src/features/dashboard/savingsJourney";
const goal = { id: 1, name: "Bike", target_amount_cents: 100000, amount_already_saved_cents: 30000, target_date: "2026-11-18", created_at: "2026-10-10T12:00:00Z" };
describe("savings journey", () => {
  it("counts calendar weeks and days independently of actual money saved", () => {
    const result = goalJourney(goal, new Date(2026, 9, 18, 12));
    expect(result.week).toBe(2); expect(result.day).toBe(2); expect(result.daysLeft).toBe(31);
    expect(result.ratio).toBe(.3); expect(result.nextMilestone).toBe(50); expect(result.toNextMilestone).toBe(20000);
  });
  it("does not invent a starting date for older API responses", () => {
    expect(goalJourney({ ...goal, created_at: undefined }).week).toBeNull();
  });
  it("handles day one, completed goals, and overdue deadlines", () => {
    expect(goalJourney(goal, new Date(2026, 9, 10, 12)).day).toBe(1);
    expect(goalJourney({ ...goal, amount_already_saved_cents: 100000 }).complete).toBe(true);
    const overdue = goalJourney(goal, new Date(2026, 11, 1));
    expect(overdue.overdue).toBe(true); expect(overdue.daysLeft).toBe(0);
  });
});
