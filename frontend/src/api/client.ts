const configuredBaseUrl = import.meta.env.VITE_API_BASE_URL?.trim();
const apiBaseUrl = configuredBaseUrl?.replace(/\/$/, "") ?? "";

type ErrorBody = {
  detail?: unknown;
};

export class ApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

function errorMessage(body: ErrorBody | null, status: number): string {
  if (typeof body?.detail === "string") return body.detail;
  return `SaveHaven request failed (${status})`;
}

export async function apiRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body !== undefined && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(`${apiBaseUrl}${path}`, {
    ...init,
    credentials: "include",
    headers,
  });

  if (!response.ok) {
    const body = await response.json().catch(() => null) as ErrorBody | null;
    throw new ApiError(response.status, errorMessage(body, response.status));
  }

  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

export function isApiError(error: unknown, status?: number): error is ApiError {
  return error instanceof ApiError && (status === undefined || error.status === status);
}
