"use client";

/**
 * apps/web/src/components/effects/PageTransitionOverlay.tsx
 *
 * Requirement 2: when AppShell detects a pathname change between the main
 * tabs, it mounts one of these (keyed by the new pathname, so it replays
 * every navigation). Five paw prints step in left-to-right like footsteps
 * over 0.6s, then this opaque cover fades out — revealing the new page,
 * which has already crossfaded in underneath by then via AppShell's
 * existing AnimatePresence.
 *
 * AppShell owns *when this unmounts* via a plain `setTimeout` (see
 * `TOTAL_DURATION_MS` below, exported so both files agree on one number)
 * rather than this component's own animation-completion callback — this
 * covers the whole screen while it's up, so its removal can't be allowed
 * to depend on a `motion` callback firing (a backgrounded tab throttling
 * requestAnimationFrame, a rapid repeat navigation interrupting the
 * animation, etc. would otherwise risk leaving the app stuck under an
 * opaque cover). The animation here is purely visual.
 */

import { motion } from "framer-motion";
import { PAW_PATH } from "./pawPath";

const STEP_COUNT = 5;
const WALK_DURATION = 0.6;
const FADE_OUT_DURATION = 0.2;
/** AppShell clears `transitionKey` after this many ms — a little past the
 * animation's own total (walk + fade-out) so the fade always finishes
 * first in the common case, with a safety margin if it doesn't. */
export const TOTAL_DURATION_MS = (WALK_DURATION + FADE_OUT_DURATION) * 1000 + 150;

export function PageTransitionOverlay() {
  return (
    <motion.div
      initial={{ opacity: 1 }}
      animate={{ opacity: 0 }}
      exit={{ opacity: 0 }}
      transition={{ delay: WALK_DURATION, duration: FADE_OUT_DURATION, ease: "easeOut" }}
      className="pointer-events-none absolute inset-0 z-50 overflow-hidden bg-page"
      aria-hidden="true"
    >
      {Array.from({ length: STEP_COUNT }).map((_, i) => {
        const stepDelay = (i / STEP_COUNT) * WALK_DURATION;
        // Alternate left/right of the walk line, like actual left-right
        // footsteps, drifting slightly downward too so it reads as a path
        // rather than a straight row of icons.
        const yOffset = i % 2 === 0 ? -6 : 6;
        return (
          <motion.svg
            key={i}
            viewBox="0 0 24 24"
            fill="#a78bfa"
            style={{
              position: "absolute",
              left: `${8 + i * 20}%`,
              top: `calc(50% + ${yOffset}px)`,
              width: 22,
              height: 22,
            }}
            initial={{ opacity: 0, scale: 0.4 }}
            animate={{ opacity: [0, 1, 1, 0], scale: [0.4, 1.1, 1, 0.8] }}
            transition={{
              duration: 0.45,
              delay: stepDelay,
              times: [0, 0.35, 0.7, 1],
              ease: "easeOut",
            }}
          >
            <path d={PAW_PATH} />
          </motion.svg>
        );
      })}
    </motion.div>
  );
}
