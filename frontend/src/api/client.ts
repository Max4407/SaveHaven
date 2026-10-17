const configuredBaseUrl = import.meta.env.VITE_API_BASE_URL?.trim();
const apiBaseUrl = configuredBaseUrl?.replace(/\/$/, "") ?? "";

type ErrorBody = {
  detail?: unknown;
};

export class ApiError extends Error {
  readonly status: number;
  readonly code?: string;

  constructor(status: number, message: string, code?: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}

function errorDetail(body: ErrorBody | null, status: number): { message: string; code?: string } {
  if (typeof body?.detail === "string") return { message: body.detail };
  if (body?.detail && typeof body.detail === "object") {
    const detail = body.detail as { message?: unknown; code?: unknown };
    if (typeof detail.message === "string") {
      return {
        message: detail.message,
        code: typeof detail.code === "string" ? detail.code : undefined,
      };
    }
  }
  return { message: `SaveHaven request failed (${status})` };
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
    const detail = errorDetail(body, response.status);
    throw new ApiError(response.status, detail.message, detail.code);
  }

  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

export function isApiError(error: unknown, status?: number): error is ApiError {
  return error instanceof ApiError && (status === undefined || error.status === status);
}
