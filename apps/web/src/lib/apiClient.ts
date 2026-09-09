/**
 * apps/web/src/lib/apiClient.ts
 *
 * Thin fetch wrapper that knows the ApiResponse<T> envelope shape from
 * @pawball/shared-types, so feature code never re-implements
 * success/error unwrapping per call site.
 */

import type { ApiResponse, AuthTokens } from "@pawball/shared-types";
import { useAuthStore } from "@/stores/useAuthStore";

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api/v1";

export class ApiClientError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number
  ) {
    super(message);
  }
}

export async function apiFetch<T>(
  path: string,
  options?: RequestInit
): Promise<T> {
  const isFormData = options?.body instanceof FormData;

  const res = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers: {
      // FormData sets its own multipart boundary header automatically —
      // forcing application/json here would corrupt multipart uploads
      // (e.g. capture image upload), so it's only added for non-FormData
      // bodies.
      ...(!isFormData && { "Content-Type": "application/json" }),
      ...options?.headers,
    },
  });

  const body: ApiResponse<T> = await res.json();

  if (!res.ok || !body.success || body.data === undefined) {
    throw new ApiClientError(
      body.error?.code ?? "UNKNOWN_ERROR",
      body.error?.message ?? "Request failed",
      res.status
    );
  }

  return body.data;
}

/**
 * Like apiFetch, but attaches the current access token and, on a 401,
 * attempts exactly one refresh-and-retry before giving up and clearing the
 * session. "Exactly one" matters — without a retry cap, a server that
 * keeps returning 401 even after a successful-looking refresh (e.g. a
 * genuinely revoked session) would otherwise loop indefinitely.
 */
export async function authFetch<T>(
  path: string,
  options?: RequestInit
): Promise<T> {
  const { accessToken } = useAuthStore.getState();

  try {
    return await apiFetch<T>(path, {
      ...options,
      headers: { ...options?.headers, Authorization: `Bearer ${accessToken}` },
    });
  } catch (err) {
    const isAuthError =
      err instanceof ApiClientError &&
      (err.code === "AUTH_TOKEN_EXPIRED" || err.code === "AUTH_UNAUTHORIZED");

    if (!isAuthError) throw err;

    const { refreshToken, setTokens, clearSession } = useAuthStore.getState();
    if (!refreshToken) {
      clearSession();
      throw err;
    }

    try {
      const newTokens = await apiFetch<AuthTokens>("/auth/refresh", {
        method: "POST",
        body: JSON.stringify({ refreshToken }),
      });
      setTokens(newTokens.accessToken, newTokens.refreshToken);

      return await apiFetch<T>(path, {
        ...options,
        headers: {
          ...options?.headers,
          Authorization: `Bearer ${newTokens.accessToken}`,
        },
      });
    } catch {
      clearSession();
      throw err;
    }
  }
}
