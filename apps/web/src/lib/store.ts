/**
 * apps/web/src/lib/store.ts
 *
 * Zustand store: the auth session (tokens + user), persisted to
 * localStorage. `hydrated` flips true once persist has read localStorage
 * back on the client, so route guards don't bounce a logged-in user for a
 * frame during the first paint.
 *
 * localStorage for JWTs is an XSS trade-off (documented since Milestone 2):
 * fine for this Next.js-PWA-calls-Express-directly setup; an httpOnly-cookie
 * migration is a production-hardening item.
 */

"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { PublicUser } from "@pawball/shared-types";

interface AuthState {
  user: PublicUser | null;
  accessToken: string | null;
  refreshToken: string | null;
  hydrated: boolean;
  setSession: (user: PublicUser, accessToken: string, refreshToken: string) => void;
  setTokens: (accessToken: string, refreshToken: string) => void;
  clear: () => void;
  _markHydrated: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      accessToken: null,
      refreshToken: null,
      hydrated: false,
      setSession: (user, accessToken, refreshToken) =>
        set({ user, accessToken, refreshToken }),
      setTokens: (accessToken, refreshToken) => set({ accessToken, refreshToken }),
      clear: () => set({ user: null, accessToken: null, refreshToken: null }),
      _markHydrated: () => set({ hydrated: true }),
    }),
    {
      name: "pawball-auth",
      partialize: (s) => ({
        user: s.user,
        accessToken: s.accessToken,
        refreshToken: s.refreshToken,
      }),
      onRehydrateStorage: () => (state) => state?._markHydrated(),
    }
  )
);

/** Non-hook accessors for lib/api.ts (which runs outside React). */
export const authSession = {
  get: () => useAuthStore.getState(),
  setTokens: (a: string, r: string) => useAuthStore.getState().setTokens(a, r),
  clear: () => useAuthStore.getState().clear(),
};
