/**
 * apps/web/src/components/cards/rarity.ts
 *
 * Single source for rarity -> colour, shared by PawBallCard, CollectionGrid
 * and the map markers so a "legendary" is the same gold everywhere.
 */

import type { Rarity } from "@pawball/shared-types";

export const RARITY_COLOR: Record<Rarity, string> = {
  common: "#9d8fc7",
  uncommon: "#7bc8f6",
  rare: "#7bc8f6",
  epic: "#a78bfa",
  legendary: "#f4c842",
};

export const RARITY_ORDER: Rarity[] = [
  "common",
  "uncommon",
  "rare",
  "epic",
  "legendary",
];

export function rarityColor(rarity: string | undefined): string {
  return RARITY_COLOR[(rarity ?? "common") as Rarity] ?? RARITY_COLOR.common;
}

/** rgba glow for a card frame, stronger for epic/legendary. */
export function rarityGlow(rarity: string | undefined): string {
  const c = rarityColor(rarity);
  const strong = rarity === "legendary" || rarity === "epic";
  return `0 0 ${strong ? "34px -3px" : "22px -6px"} ${hexToRgba(c, strong ? 0.55 : 0.35)}`;
}

function hexToRgba(hex: string, alpha: number): string {
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
