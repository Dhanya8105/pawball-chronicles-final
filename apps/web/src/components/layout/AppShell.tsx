"use client";

/**
 * apps/web/src/components/layout/AppShell.tsx
 *
 * Wraps every page in the 430px centered mobile column and the fixed bottom
 * nav, and gates access: if the persisted session has hydrated and there is
 * no user, redirect to /auth. The /auth route itself renders bare (no
 * guard, no nav) so the sign-in screen isn't wrapped in its own redirect.
 */

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useAuthStore } from "@/lib/store";
import { BottomNav } from "./BottomNav";
import {
  PageTransitionOverlay,
  TOTAL_DURATION_MS,
} from "@/components/effects/PageTransitionOverlay";

const PUBLIC_ROUTES = new Set(["/auth"]);

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const hydrated = useAuthStore((s) => s.hydrated);
  const reduceMotion = useReducedMotion();

  const isPublic = PUBLIC_ROUTES.has(pathname);

  useEffect(() => {
    if (!isPublic && hydrated && !user) {
      router.replace("/auth");
    }
  }, [isPublic, hydrated, user, router]);

  // Requirement 2: a paw-print walk plays over the page on every navigation
  // between the main tabs. `transitionKey` is null except while that's
  // playing; cleared by a plain timer (TOTAL_DURATION_MS) rather than the
  // overlay's own animation-completion callback — see PageTransitionOverlay
  // for why that matters here specifically (it's a full-screen cover).
  const [transitionKey, setTransitionKey] = useState<string | null>(null);
  const isFirstRender = useRef(true);
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    if (reduceMotion) return;
    setTransitionKey(pathname);
    const timer = setTimeout(() => setTransitionKey(null), TOTAL_DURATION_MS);
    return () => clearTimeout(timer);
  }, [pathname, reduceMotion]);

  if (isPublic) {
    return (
      <main className="relative z-10 mx-auto flex min-h-screen max-w-app flex-col px-5">
        {children}
      </main>
    );
  }

  const ready = hydrated && !!user;

  return (
    <div className="relative z-10 mx-auto min-h-screen max-w-app">
      <AnimatePresence>
        {transitionKey && <PageTransitionOverlay key={transitionKey} />}
      </AnimatePresence>
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
