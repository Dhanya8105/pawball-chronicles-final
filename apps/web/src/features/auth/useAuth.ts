/**
 * apps/web/src/features/auth/useAuth.ts
 */

"use client";

import { useMutation } from "@tanstack/react-query";
import type { AuthResponse } from "@pawball/shared-types";
import { useRouter } from "next/navigation";
import { apiFetch, authFetch } from "@/lib/apiClient";
import { useAuthStore } from "@/stores/useAuthStore";

export function useRegister() {
  const router = useRouter();
  const setSession = useAuthStore((s) => s.setSession);

  return useMutation({
    mutationFn: (input: { email: string; password: string; displayName: string }) =>
      apiFetch<AuthResponse>("/auth/register", {
        method: "POST",
        body: JSON.stringify(input),
      }),
    onSuccess: (data) => {
      setSession(data.user, data.accessToken, data.refreshToken);
      router.push("/dashboard");
    },
  });
}

export function useLogin() {
  const router = useRouter();
  const setSession = useAuthStore((s) => s.setSession);

  return useMutation({
    mutationFn: (input: { email: string; password: string }) =>
      apiFetch<AuthResponse>("/auth/login", {
        method: "POST",
        body: JSON.stringify(input),
      }),
    onSuccess: (data) => {
      setSession(data.user, data.accessToken, data.refreshToken);
      router.push("/dashboard");
    },
  });
}

export function useLogout() {
  const router = useRouter();
  const clearSession = useAuthStore((s) => s.clearSession);
  const refreshToken = useAuthStore((s) => s.refreshToken);

  return useMutation({
    mutationFn: async () => {
      if (refreshToken) {
        await authFetch("/auth/logout", {
          method: "POST",
          body: JSON.stringify({ refreshToken }),
        });
      }
    },
    onSuccess: () => {
      clearSession();
      router.push("/login");
    },
    // Even if the network call fails, the user clicked "log out" — clear
    // the local session anyway so they aren't stuck unable to leave.
    onError: () => {
      clearSession();
      router.push("/login");
    },
  });
}
