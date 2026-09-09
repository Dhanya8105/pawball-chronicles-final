/**
 * apps/web/src/stores/useAuthStore.ts
 *
 * Token storage tradeoff, stated plainly: storing JWTs in localStorage
 * (via Zustand's persist middleware) is vulnerable to XSS-based token theft
 * in a way that httpOnly cookies are not. The httpOnly-cookie approach
 * would require apps/api to set/read cookies and apps/web to proxy auth
 * through Next.js route handlers (or same-site cookie config) rather than
 * calling the API directly from the browser — a bigger architectural shift
 * than Milestone 2's scope. localStorage is the pragmatic choice for now
 * given the brief's stack (Next.js PWA calling an Express API directly from
 * the client); revisiting this is a good Milestone 10 (production
 * hardening) item if XSS risk needs tightening further.
 */

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { PublicUser } from "@pawball/shared-types";

interface AuthState {
  user: PublicUser | null;
  accessToken: string | null;
  refreshToken: string | null;
  isHydrated: boolean;
  setSession: (user: PublicUser, accessToken: string, refreshToken: string) => void;
  setTokens: (accessToken: string, refreshToken: string) => void;
  clearSession: () => void;
  setHydrated: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      accessToken: null,
      refreshToken: null,
      isHydrated: false,
      setSession: (user, accessToken, refreshToken) =>
        set({ user, accessToken, refreshToken }),
      setTokens: (accessToken, refreshToken) => set({ accessToken, refreshToken }),
      clearSession: () => set({ user: null, accessToken: null, refreshToken: null }),
      setHydrated: () => set({ isHydrated: true }),
    }),
    {
      name: "pawball-auth",
      onRehydrateStorage: () => (state) => {
        state?.setHydrated();
      },
    }
  )
);
