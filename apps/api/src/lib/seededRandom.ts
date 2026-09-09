/**
 * apps/api/src/lib/seededRandom.ts
 *
 * Deterministic pseudo-randomness for the fantasy engines. The rule tables
 * in modules/aura, modules/lore and modules/region decide *what* a PawBall
 * is (class, element, rarity — all pure lookups). This module supplies the
 * *variety* on top: which of 30 name prefixes, which of N lore templates,
 * how far each stat drifts from its base.
 *
 * The seed for a PawBall is:
 *
 *     computeSeed([userId, capturedAt.toISOString(), breed, coatColor])
 *
 * so the same cat photographed by the same user at the same instant always
 * generates byte-for-byte identical output (reproducible, unit-testable,
 * safe to re-run on a job retry). The seed only moves when something real
 * about the encounter changes.
 *
 * PRNG is mulberry32 — tiny, fast, no dependency, good enough for cosmetic
 * variety (this is not, and must not be used as, a cryptographic RNG).
 */

import { createHash } from "crypto";

export type Rng = () => number;

/** Stable 32-bit unsigned seed from an ordered list of parts. */
export function computeSeed(parts: Array<string | number>): number {
  const digest = createHash("sha256").update(parts.join("|")).digest();
  return digest.readUInt32BE(0);
}

/** mulberry32 — returns a function yielding floats in [0, 1). */
export function makeRng(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Seeded pick of one element. Never mutates `items`. */
export function pick<T>(rng: Rng, items: readonly T[]): T {
  if (items.length === 0) {
    throw new Error("seededRandom.pick: cannot pick from an empty list");
  }
  return items[Math.floor(rng() * items.length)] as T;
}

/**
 * base ± delta, rounded, clamped to [min, max]. Used for the "seeded ±15
 * spread per stat" rule — call once per stat, in a fixed order, off the
 * same rng so the spread is reproducible.
 */
export function spread(
  rng: Rng,
  base: number,
  delta: number,
  min = 1,
  max = 120
): number {
  const value = Math.round(base + (rng() * 2 - 1) * delta);
  return Math.min(max, Math.max(min, value));
}

/** Seeded rotation: deterministic index in [0, size) from a seed + offset. */
export function rotation(seed: number, offset: number, size: number): number {
  return (((seed % size) + (offset % size)) % size + size) % size;
}
