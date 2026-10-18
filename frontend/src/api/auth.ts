import { apiRequest, isApiError } from "./client";
import type { SessionUser } from "./types";

export async function getSession(): Promise<SessionUser | null> {
  try {
    return await apiRequest<SessionUser>("/api/auth/session");
  } catch (error) {
    if (isApiError(error, 401)) return null;
    throw error;
  }
}

export function demoLogin(email: string, password: string): Promise<SessionUser> {
  return apiRequest<SessionUser>("/api/auth/demo-login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
}

export function logout(): Promise<void> {
  return apiRequest<void>("/api/auth/logout", { method: "POST" });
}
