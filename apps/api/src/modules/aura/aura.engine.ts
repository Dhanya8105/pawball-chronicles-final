/**
 * apps/api/src/modules/aura/aura.engine.ts
 *
 * CV output -> RPG aura traits. Deterministic: same CV reading in, same
 * traits out, every time, with no model call. Each returned trait carries a
 * `derivedFrom` entry naming the exact CV feature + value that produced it,
 * so the card UI can explain "why does this cat have Dream Affinity?".
 *
 * Traits are ordered by the confidence of the CV feature that granted them
 * (a trait derived from a 0.9-confidence pose reading outranks one from a
 * 0.3-confidence ear reading), then truncated to MAX_AURA_TRAITS.
 */

import type { AuraTrait } from "@pawball/shared-types";
import type { CvAnalysisResult } from "../../lib/aiServiceClient";
import { AURA_RULES, DEFAULT_AURA_TRAIT, MAX_AURA_TRAITS } from "./aura.data";

export interface DerivedAura {
  traits: string[];
  derivedFrom: AuraTrait[];
}

interface FeatureReading {
  feature: string;
  value: string;
  confidence: number;
}

/** Flattens the CV result into (feature, value, confidence) rows the rule
 * table can be matched against. */
function readings(cv: CvAnalysisResult): FeatureReading[] {
  const primarySurrounding = cv.surroundings[0];
  const rows: FeatureReading[] = [
    { feature: "pose", value: cv.pose.label, confidence: cv.pose.confidence ?? 0 },
    {
      feature: "eyeOpenness",
      value: cv.eyeOpenness.label,
      confidence: cv.eyeOpenness.confidence ?? 0,
    },
    {
      feature: "earOrientation",
      value: cv.earOrientation.label,
      confidence: cv.earOrientation.confidence ?? 0,
    },
    {
      feature: "estimatedAgeGroup",
      value: cv.estimatedAgeGroup.label,
      confidence: cv.estimatedAgeGroup.confidence ?? 0,
    },
    {
      feature: "coatPattern",
      value: cv.coat.pattern,
      confidence: cv.coat.confidence ?? 0,
    },
    {
      // The tail heuristic returns a bare bool with no confidence, per the
      // project's confidence-honesty rule. Give it a low fixed weight so a
      // real classifier reading always outranks it, and never surface a
      // fake number.
      feature: "tailVisible",
      value: String(cv.tailVisible),
      confidence: 0.1,
    },
  ];
  if (primarySurrounding) {
    rows.push({
      feature: "surroundings",
      value: primarySurrounding.label,
      confidence: primarySurrounding.confidence ?? 0,
    });
  }
  return rows;
}

export function deriveAura(cv: CvAnalysisResult): DerivedAura {
  const matched: Array<{ trait: string; source: AuraTrait; confidence: number }> = [];
  const seenTraits = new Set<string>();

  for (const reading of readings(cv)) {
    const rule = AURA_RULES.find(
      (r) =>
        r.sourceFeature === reading.feature &&
        r.sourceValue.toLowerCase() === reading.value.toLowerCase()
    );
    if (!rule || seenTraits.has(rule.trait)) continue;
    seenTraits.add(rule.trait);
    matched.push({
      trait: rule.trait,
      confidence: reading.confidence,
      source: {
        trait: rule.trait,
        sourceFeature: rule.sourceFeature,
        sourceValue: reading.value,
      },
    });
  }

  matched.sort((a, b) => b.confidence - a.confidence);
  const top = matched.slice(0, MAX_AURA_TRAITS);

  if (top.length === 0) {
    return {
      traits: [DEFAULT_AURA_TRAIT],
      derivedFrom: [
        {
          trait: DEFAULT_AURA_TRAIT,
          sourceFeature: "none",
          sourceValue: "no confident CV features",
        },
      ],
    };
  }

  return {
    traits: top.map((m) => m.trait),
    derivedFrom: top.map((m) => m.source),
  };
}
