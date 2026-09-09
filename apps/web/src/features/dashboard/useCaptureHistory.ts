"use client";

import { useQuery } from "@tanstack/react-query";
import type { CaptureListResponse } from "@pawball/shared-types";
import { authFetch } from "@/lib/apiClient";
import { useAuthStore } from "@/stores/useAuthStore";

export function useCaptureHistory(page = 1) {
  const isHydrated = useAuthStore((s) => s.isHydrated);
  const user = useAuthStore((s) => s.user);

  return useQuery({
    queryKey: ["captures", page],
    queryFn: () => authFetch<CaptureListResponse>(`/captures?page=${page}`),
    // Wait for auth hydration + a logged-in user before firing — otherwise
    // this would fire once with no token while the store is still
    // rehydrating from localStorage on first paint.
    enabled: isHydrated && !!user,
  });
}
