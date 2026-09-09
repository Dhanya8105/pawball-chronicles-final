"use client";

/**
 * apps/web/src/components/layout/AppShell.tsx
 *
 * Wraps every page in the 430px centered mobile column and the fixed bottom
 * nav, and gates access: if the persisted session has hydrated and there is
 * no user, redirect to /auth. The /auth route itself renders bare (no
 * guard, no nav) so the sign-in screen isn't wrapped in its own redirect.
 */

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { useAuthStore } from "@/lib/store";
import { BottomNav } from "./BottomNav";

const PUBLIC_ROUTES = new Set(["/auth"]);

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const hydrated = useAuthStore((s) => s.hydrated);

  const isPublic = PUBLIC_ROUTES.has(pathname);

  useEffect(() => {
    if (!isPublic && hydrated && !user) {
      router.replace("/auth");
    }
  }, [isPublic, hydrated, user, router]);

  if (isPublic) {
    return (
      <main className="mx-auto flex min-h-screen max-w-app flex-col px-5">
        {children}
      </main>
    );
  }

  const ready = hydrated && !!user;

  return (
    <div className="relative mx-auto min-h-screen max-w-app">
      <AnimatePresence mode="wait">
        {ready ? (
          <motion.main
            key={pathname}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.24, ease: "easeOut" }}
            className="px-4 pb-28 pt-4"
          >
            {children}
          </motion.main>
        ) : (
          <div
            key="loading"
            className="flex min-h-screen items-center justify-center text-sm text-muted"
          >
            <LoadingPulse />
          </div>
        )}
      </AnimatePresence>
      {ready && <BottomNav />}
    </div>
  );
}

function LoadingPulse() {
  return (
    <div className="flex items-center gap-2">
      {[0, 1, 2].map((i) => (
        <motion.span
          key={i}
          className="h-2 w-2 rounded-full bg-purple"
          animate={{ opacity: [0.25, 1, 0.25] }}
          transition={{ duration: 1.1, repeat: Infinity, delay: i * 0.18 }}
        />
      ))}
    </div>
  );
}
