/**
 * apps/web/src/features/auth/useRequireAuth.ts
 *
 * Zustand's persist middleware hydrates from localStorage asynchronously
 * after first render, so checking `user === null` immediately on mount
 * would incorrectly redirect an already-logged-in user for a frame before
 * hydration completes. isHydrated (set by onRehydrateStorage in
 * useAuthStore) gates the redirect check until hydration has actually run.
 */

"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/stores/useAuthStore";

export function useRequireAuth() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const isHydrated = useAuthStore((s) => s.isHydrated);

  useEffect(() => {
    if (isHydrated && !user) {
      router.replace("/login");
    }
  }, [isHydrated, user, router]);

  return { user, isReady: isHydrated && !!user };
}
