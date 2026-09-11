/**
 * apps/web/src/components/effects/AtmosphereBackground.tsx
 *
 * The always-on decorative background: scattered drifting paw prints
 * (requirement 1) and a few floating cat silhouettes (requirement 4).
 * Mounted once in app/layout.tsx, `position: fixed` behind everything
 * (z-index: -1, see globals.css .pawmotion-field) — pure CSS keyframes, no
 * JS animation loop, so it costs nothing once painted. Layout is computed
 * once at module load with a small seeded PRNG rather than `Math.random()`
 * per render, so the field doesn't reshuffle/jump on every re-render and
 * stays identical between server and client markup.
 */

import { PAW_PATH } from "./pawPath";

interface PawSpec {
  id: number;
  left: number;
  top: number;
  size: number;
  rotate: number;
  opacity: number;
  duration: number;
  delay: number;
}

interface CatSpec {
  id: string;
  style: React.CSSProperties;
  width: number;
  duration: number;
  delay: number;
}

const PAW_COUNT = 14;

/** mulberry32 — deterministic, no external dependency, good enough
 * distribution for scattering decorative elements. */
function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function buildPaws(count: number): PawSpec[] {
  const rand = mulberry32(0xca7f00d);
  return Array.from({ length: count }, (_, i) => ({
    id: i,
    left: rand() * 96 + 2, // 2%–98%, keeps paws off the very edge
    top: rand() * 96 + 2,
    size: 12 + rand() * 20, // 12px–32px
    rotate: rand() * 360,
    opacity: 0.04 + rand() * 0.04, // 0.04–0.08
    duration: 18 + rand() * 14, // 18s–32s per drift cycle
    delay: -rand() * 30, // negative so cycles start already in progress
  }));
}

const PAWS = buildPaws(PAW_COUNT);

const CATS: CatSpec[] = [
  { id: "top-right", style: { top: "7%", right: "3%" }, width: 56, duration: 6, delay: 0 },
  { id: "bottom-left", style: { bottom: "20%", left: "2%" }, width: 46, duration: 7.5, delay: -2.4 },
  { id: "mid-right", style: { top: "48%", right: "-4%" }, width: 34, duration: 8.5, delay: -4.8 },
];

export function AtmosphereBackground() {
  return (
    <div className="pawmotion-field" aria-hidden="true">
      {PAWS.map((p) => (
        <svg
          key={p.id}
          className="pawmotion-paw"
          style={
            {
              left: `${p.left}%`,
              top: `${p.top}%`,
              width: p.size,
              height: p.size,
              "--paw-rotate": `${p.rotate}deg`,
              "--paw-opacity": p.opacity,
              animationDuration: `${p.duration}s`,
              animationDelay: `${p.delay}s`,
            } as React.CSSProperties
          }
          viewBox="0 0 24 24"
          fill="currentColor"
        >
          <path d={PAW_PATH} />
        </svg>
      ))}

      {CATS.map((c) => (
        <svg
          key={c.id}
          className="pawmotion-cat"
          style={{
            ...c.style,
            width: c.width,
            height: c.width * 0.8,
            animationDuration: `${c.duration}s`,
            animationDelay: `${c.delay}s`,
          }}
          viewBox="0 0 100 80"
          fill="currentColor"
        >
          {/* Simple sitting-cat silhouette: head + two ears, body, curled tail. */}
          <ellipse cx="55" cy="52" rx="30" ry="20" />
          <circle cx="24" cy="28" r="16" />
          <path d="M10 20 L16 2 L24 18 Z" />
          <path d="M26 16 L36 0 L38 18 Z" />
          <path d="M78 50 Q96 44 90 22 Q87 14 80 17 Q86 30 74 38 Z" />
        </svg>
      ))}
    </div>
  );
}
