"use client";

import { useRequireAuth } from "@/features/auth/useRequireAuth";
import { useLogout } from "@/features/auth/useAuth";
import { CaptureHistoryList } from "@/features/dashboard/CaptureHistoryList";

export default function DashboardPage() {
  const { user, isReady } = useRequireAuth();
  const logout = useLogout();

  if (!isReady) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <p className="text-white/60">Loading…</p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-2xl px-6 py-12">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <p className="text-sm uppercase tracking-[0.2em] text-pawball-gold">
            Dashboard
          </p>
          <h1 className="text-2xl font-bold">Welcome, {user?.displayName}</h1>
        </div>
        <button
          onClick={() => logout.mutate()}
          disabled={logout.isPending}
          className="rounded-lg border border-white/15 px-4 py-2 text-sm text-white/80 hover:bg-white/5"
        >
          {logout.isPending ? "Signing out…" : "Sign out"}
        </button>
      </div>

      <h2 className="mb-4 text-lg font-semibold">Your captures</h2>
      <CaptureHistoryList />
    </main>
  );
}
