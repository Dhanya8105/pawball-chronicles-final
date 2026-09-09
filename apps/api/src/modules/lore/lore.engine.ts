/**
 * apps/api/src/modules/lore/lore.engine.ts
 *
 * breed + region + pose + aura + encounter context -> a full fantasy
 * identity: name, title, class, element, rarity, stats, abilities, and the
 * origin lore paragraph. Plus `generateWeeklyUpdate` for the Weekly Life
 * job.
 *
 * No LLM anywhere. rarity/class/element are pure lookups over the tables in
 * lore.data.ts; name/prose/weekly-text/stat-spread are seeded selections
 * off the PawBall seed so they are reproducible and unit-testable.
 */

import type {
  Element,
  FantasyClass,
  PawBallAbilities,
  PawBallIdentity,
  PawBallStats,
  Rarity,
} from "@pawball/shared-types";
import { makeRng, pick, rotation, spread, type Rng } from "../../lib/seededRandom";
import {
  AURA_SENTENCES,
  BIOME_OPENERS,
  BREED_GROUP,
  BREED_RARITY_WEIGHT,
  CLASS_PASSIVES,
  CLASS_SENTENCES,
  CLASS_STAT_TILT,
  CLASS_TABLE,
  CLASS_TITLE_WORD,
  DEFAULT_BREED_GROUP,
  DEFAULT_ELEMENT_COLOR_KEY,
  DEFAULT_SURROUNDING_GROUP,
  DEFAULT_TRAIT,
  ELEMENT_CLOSERS,
  ELEMENT_TABLE,
  ELEMENT_ULTIMATES,
  MIDDLE_DETAILS,
  NAME_PREFIXES,
  NAME_SUFFIXES,
  RARITY_THRESHOLDS,
  STAT_BASE_BY_RARITY,
  STAT_ORDER,
  STAT_SPREAD,
  SURROUNDING_GROUP,
  SURROUNDING_RARITY_WEIGHT,
  TIME_RARITY_WEIGHT,
  WEATHER_RARITY_WEIGHT,
  WEEKLY_TEMPLATES,
  type TimeOfDay,
  type Weather,
} from "./lore.data";
import type { Biome } from "@pawball/shared-types";

// ---------------------------------------------------------------------------
// Encounter context helpers
// ---------------------------------------------------------------------------

export function timeOfDay(capturedAt: Date): TimeOfDay {
  const h = capturedAt.getHours();
  if (h >= 5 && h < 8) return "dawn";
  if (h >= 8 && h < 17) return "day";
  if (h >= 17 && h < 20) return "dusk";
  return "night";
}

/** No weather feed yet (Milestone 4+), so derive a coarse condition from the
 * CV surroundings labels: they already tell us rain / fog / sunset. */
export function weatherFromSurroundings(labels: string[]): Weather {
  const set = new Set(labels.map((l) => l.toLowerCase()));
  if (set.has("rain")) return "rain";
  if (set.has("fog")) return "fog";
  if (set.has("sunset")) return "sunset";
  return "clear";
}

function normalize(value: string): string {
  return value.trim().toLowerCase();
}

// ---------------------------------------------------------------------------
// Deterministic lookups: rarity, class, element
// ---------------------------------------------------------------------------

export interface RarityInputs {
  breed: string;
  surroundings: string[];
  timeOfDay: TimeOfDay;
  weather: Weather;
}

export function rarityScore(inputs: RarityInputs): number {
  const breedWeight = BREED_RARITY_WEIGHT[normalize(inputs.breed)] ?? 1;
  const primarySurrounding = inputs.surroundings[0]
    ? normalize(inputs.surroundings[0])
    : "";
  const surroundingWeight =
    SURROUNDING_RARITY_WEIGHT[primarySurrounding] ?? 1;
  return (
    breedWeight +
    surroundingWeight +
    TIME_RARITY_WEIGHT[inputs.timeOfDay] +
    WEATHER_RARITY_WEIGHT[inputs.weather]
  );
}

export function scoreRarity(inputs: RarityInputs): Rarity {
  const score = rarityScore(inputs);
  for (const tier of RARITY_THRESHOLDS) {
    if (score >= tier.min) return tier.rarity;
  }
  return "common";
}

export function classFor(breed: string, primarySurrounding: string): FantasyClass {
  const breedGroup = BREED_GROUP[normalize(breed)] ?? DEFAULT_BREED_GROUP;
  const surroundingGroup =
    SURROUNDING_GROUP[normalize(primarySurrounding)] ?? DEFAULT_SURROUNDING_GROUP;
  return CLASS_TABLE[breedGroup][surroundingGroup];
}

export function elementFor(coatColor: string, time: TimeOfDay): Element {
  const row =
    ELEMENT_TABLE[normalize(coatColor)] ??
    ELEMENT_TABLE[DEFAULT_ELEMENT_COLOR_KEY];
  return row[time];
}

// ---------------------------------------------------------------------------
// Stats
// ---------------------------------------------------------------------------

export function rollStats(
  rng: Rng,
  rarity: Rarity,
  fantasyClass: FantasyClass
): PawBallStats {
  const base = STAT_BASE_BY_RARITY[rarity];
  const tilt = CLASS_STAT_TILT[fantasyClass];
  const out = {} as PawBallStats;
  // Fixed STAT_ORDER traversal keeps the seeded spread reproducible.
  for (const key of STAT_ORDER) {
    out[key] = spread(rng, base + (tilt[key] ?? 0), STAT_SPREAD);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Names + prose
// ---------------------------------------------------------------------------

function fillSlots(template: string, slots: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (_, key: string) => slots[key] ?? `{${key}}`);
}

export interface GenerateIdentityInput {
  seed: number;
  breed: string;
  coatColor: string;
  coatPattern: string;
  pose: string;
  surroundings: string[];
  biome: Biome;
  regionName: string;
  auraTraits: string[];
  capturedAt: Date;
}

export interface GeneratedIdentity {
  identity: PawBallIdentity;
  stats: PawBallStats;
  abilities: PawBallAbilities;
  loreText: string;
}

export function generateIdentity(
  input: GenerateIdentityInput
): GeneratedIdentity {
  const rng = makeRng(input.seed);

  const tod = timeOfDay(input.capturedAt);
  const weather = weatherFromSurroundings(input.surroundings);
  const primarySurrounding = input.surroundings[0] ?? "";

  const rarity = scoreRarity({
    breed: input.breed,
    surroundings: input.surroundings,
    timeOfDay: tod,
    weather,
  });
  const fantasyClass = classFor(input.breed, primarySurrounding);
  const element = elementFor(input.coatColor, tod);

  // Name: seeded prefix + seeded suffix, fused.
  const fantasyName = `${pick(rng, NAME_PREFIXES)}${pick(rng, NAME_SUFFIXES)}`;
  const title = `${CLASS_TITLE_WORD[fantasyClass]} of ${input.regionName}`;

  const identity: PawBallIdentity = {
    fantasyName,
    title,
    class: fantasyClass,
    rarity,
    element,
  };

  const primaryTrait = input.auraTraits[0] ?? DEFAULT_TRAIT;
  const slots: Record<string, string> = {
    name: fantasyName,
    region: input.regionName,
    breed: input.breed,
    class: fantasyClass,
    element,
    trait: primaryTrait,
  };

  // Lore prose: opener + class sentence + aura sentence, plus a ~50% middle
  // detail, plus the element closer -> 3 to 5 sentences.
  const sentences: string[] = [
    fillSlots(pick(rng, BIOME_OPENERS[input.biome]), slots),
    fillSlots(pick(rng, CLASS_SENTENCES[fantasyClass]), slots),
    fillSlots(pick(rng, AURA_SENTENCES), slots),
  ];
  if (rng() < 0.5) {
    sentences.push(fillSlots(pick(rng, MIDDLE_DETAILS), slots));
  }
  sentences.push(fillSlots(pick(rng, ELEMENT_CLOSERS[element]), slots));
  const loreText = sentences.join(" ");

  // Abilities: one class passive + one element ultimate, seeded.
  const passiveTpl = pick(rng, CLASS_PASSIVES[fantasyClass]);
  const ultimateTpl = pick(rng, ELEMENT_ULTIMATES[element]);
  const abilities: PawBallAbilities = {
    passive: {
      name: passiveTpl.name,
      description: fillSlots(passiveTpl.description, slots),
    },
    ultimate: {
      name: ultimateTpl.name,
      description: fillSlots(ultimateTpl.description, slots),
    },
  };

  // Stats last, so the earlier prose picks don't shift when stat logic changes.
  const stats = rollStats(rng, rarity, fantasyClass);

  return { identity, stats, abilities, loreText };
}

// ---------------------------------------------------------------------------
// Weekly life updates
// ---------------------------------------------------------------------------

export interface WeeklyUpdateInput {
  seed: number;
  weekNumber: number;
  element: string;
  name: string;
  regionName: string;
  trait: string;
}

export function generateWeeklyUpdate(input: WeeklyUpdateInput): string {
  const variants =
    WEEKLY_TEMPLATES[input.element as Element] ?? WEEKLY_TEMPLATES.Moon;
  const index = rotation(input.seed, input.weekNumber, variants.length);
  return fillSlots(variants[index] as string, {
    name: input.name,
    region: input.regionName,
    trait: input.trait,
    element: input.element,
  });
}

// ---------------------------------------------------------------------------
// ISO week helpers (shared with jobs/weeklyLifeTick.ts)
// ---------------------------------------------------------------------------

export function isoWeekNumber(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}

export function isoWeekKey(date: Date): string {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const week = isoWeekNumber(date);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}
