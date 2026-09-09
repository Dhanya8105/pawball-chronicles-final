/**
 * apps/web/src/stores/useAppStore.ts
 *
 * Minimal Zustand store for Milestone 1 — proves the state-management layer
 * is wired correctly. Real domain stores (capture-in-progress state,
 * collection filters, etc.) get added module-by-module starting Milestone 2,
 * following this same pattern rather than one giant store.
 */

import { create } from "zustand";

interface AppUiState {
  isMobileNavOpen: boolean;
  toggleMobileNav: () => void;
}

export const useAppStore = create<AppUiState>((set) => ({
  isMobileNavOpen: false,
  toggleMobileNav: () =>
    set((state) => ({ isMobileNavOpen: !state.isMobileNavOpen })),
}));
