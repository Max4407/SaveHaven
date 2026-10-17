import { apiRequest } from "./client";
import type {
  BankConnection,
  CreateGoalInput,
  Dashboard,
  DemoProfile,
  GoalPlan,
  Health,
  NessieEventResult,
  NessieEventType,
} from "./types";

export function getHealth(): Promise<Health> {
  return apiRequest<Health>("/health");
}

export function getDemoProfiles(): Promise<DemoProfile[]> {
  return apiRequest<DemoProfile[]>("/api/demo/nessie-profiles");
}

export function connectBank(profileId: string): Promise<BankConnection> {
  return apiRequest<BankConnection>("/api/bank-connections", {
    method: "POST",
    body: JSON.stringify({ profile_id: profileId }),
  });
}

export function syncBank(): Promise<BankConnection> {
  return apiRequest<BankConnection>("/api/bank-connections/sync", { method: "POST" });
}

export function getDashboard(): Promise<Dashboard> {
  return apiRequest<Dashboard>("/api/dashboard");
}

export function createGoal(input: CreateGoalInput): Promise<GoalPlan> {
  return apiRequest<GoalPlan>("/api/goals", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function regenerateGoalPlan(goalId: number): Promise<GoalPlan> {
  return apiRequest<GoalPlan>(`/api/goals/${goalId}/plan`);
}

export function acceptGoalPlan(goalId: number): Promise<GoalPlan> {
  return apiRequest<GoalPlan>(`/api/goals/${goalId}/accept-plan`, { method: "POST" });
}

export function runNessieEvent(input: {
  event_type: NessieEventType;
  amount_cents: number;
  idempotency_key: string;
}): Promise<NessieEventResult> {
  return apiRequest<NessieEventResult>("/api/demo/nessie-events", {
    method: "POST",
    body: JSON.stringify(input),
  });
}
