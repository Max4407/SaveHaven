import { apiRequest } from "./client";
import type { BankConnection, Dashboard, DemoProfile, Health } from "./types";

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
