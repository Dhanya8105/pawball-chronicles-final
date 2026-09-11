"use client";

/**
 * apps/web/src/components/effects/RevealBurst.tsx
 *
 * Requirement 3: when a PawBall card appears after capture, paw prints
 * scatter outward from the card's center and small sparkles pop around its
 * edges, while the card itself does its existing spring scale-up
 * (PawBallCard's own `reveal` prop — unchanged). Rendered as a sibling
 * behind the card (see CapturePanel.tsx's "revealed" phase), not inside
 * PawBallCard itself, so it isn't clipped by the card's own
 * `overflow-hidden` border.
 *
 * One-shot mount animation, so this is Framer Motion rather than CSS
 * keyframes (there's no clean way to give N particles distinct radial
 * trajectories with pure CSS without a keyframe per particle) — same
 * tradeoff the page-transition walk makes.
 */

import { motion, useReducedMotion } from "framer-motion";
import { PAW_PATH } from "./pawPath";

const PAW_COUNT = 6;
const SPARKLE_COUNT = 8;

function radialOffset(index: number, total: number, radius: number) {
  const angle = (index / total) * Math.PI * 2;
  return { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius };
}

export function RevealBurst() {
  const reduceMotion = useReducedMotion();
  if (reduceMotion) return null;

  return (
    <div className="pointer-events-none absolute inset-0 z-0" aria-hidden="true">
      {Array.from({ length: PAW_COUNT }).map((_, i) => {
        const { x, y } = radialOffset(i, PAW_COUNT, 90);
        return (
          <motion.svg
            key={`paw-${i}`}
            viewBox="0 0 24 24"
            fill="#a78bfa"
            className="absolute left-1/2 top-1/2"
            style={{ width: 16, height: 16, marginLeft: -8, marginTop: -8 }}
            initial={{ x: 0, y: 0, opacity: 0, scale: 0.5, rotate: 0 }}
            animate={{ x, y, opacity: [0, 0.9, 0], scale: [0.5, 1, 0.7], rotate: 90 }}
            transition={{ duration: 0.9, delay: i * 0.04, ease: "easeOut" }}
          >
            <path d={PAW_PATH} />
          </motion.svg>
        );
      })}
      {Array.from({ length: SPARKLE_COUNT }).map((_, i) => {
        const { x, y } = radialOffset(i + 0.5, SPARKLE_COUNT, 135);
        return (
          <motion.span
            key={`sparkle-${i}`}
            className="absolute left-1/2 top-1/2 rounded-full"
            style={{
              width: 4,
              height: 4,
              marginLeft: -2,
              marginTop: -2,
              background: "#f4c842",
              boxShadow: "0 0 6px 1px rgba(244,200,66,0.8)",
            }}
            initial={{ x: 0, y: 0, opacity: 0, scale: 0 }}
            animate={{ x, y, opacity: [0, 1, 0], scale: [0, 1, 0.4] }}
            transition={{ duration: 1.1, delay: 0.15 + i * 0.05, ease: "easeOut" }}
          />
        );
      })}
    </div>
  );
}
