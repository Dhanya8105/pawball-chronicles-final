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
 *
 * `refreshTokens()` owns the actual POST /auth/refresh call. It lives here
 * rather than in lib/api.ts because api.ts already imports `authSession`
 * from this file for token storage — api.ts calling back into itself via a
 * store import the other way would be circular. api.ts just calls
 * `authSession.refreshTokens()` when it sees a 401.
 */

"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { PublicUser } from "@pawball/shared-types";
import { API_BASE_URL } from "./config";

interface AuthState {
  user: PublicUser | null;
  accessToken: string | null;
  refreshToken: string | null;
  hydrated: boolean;
  setSession: (user: PublicUser, accessToken: string, refreshToken: string) => void;
  setTokens: (accessToken: string, refreshToken: string) => void;
  clear: () => void;
  _markHydrated: () => void;
  /**
   * Exchanges the stored refresh token for a new access/refresh pair and
   * saves them. Returns false (and leaves the store untouched) if there is
   * no refresh token, the request fails, or the refresh token itself has
   * expired — the caller (lib/api.ts) is responsible for clearing the
   * session and sending the user back to /auth in that case.
   */
  refreshTokens: () => Promise<boolean>;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      accessToken: null,
      refreshToken: null,
      hydrated: false,
      setSession: (user, accessToken, refreshToken) =>
        set({ user, accessToken, refreshToken }),
      setTokens: (accessToken, refreshToken) => set({ accessToken, refreshToken }),
      clear: () => set({ user: null, accessToken: null, refreshToken: null }),
      _markHydrated: () => set({ hydrated: true }),
      refreshTokens: async () => {
        const { refreshToken } = get();
        if (!refreshToken) return false;
        try {
          const res = await fetch(`${API_BASE_URL}/auth/refresh`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ refreshToken }),
          });
          const body = await res.json().catch(() => null);
          const tokens = body?.data as
            | { accessToken?: string; refreshToken?: string }
            | undefined;
          if (!res.ok || !body?.success || !tokens?.accessToken || !tokens?.refreshToken) {
            return false;
          }
          set({ accessToken: tokens.accessToken, refreshToken: tokens.refreshToken });
          return true;
        } catch {
          return false;
        }
      },
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
  refreshTokens: () => useAuthStore.getState().refreshTokens(),
};
