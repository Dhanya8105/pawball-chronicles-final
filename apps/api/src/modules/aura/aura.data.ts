/**
 * apps/api/src/modules/aura/aura.data.ts
 *
 * The Aura Engine's rule table. Each row maps one concrete CV feature value
 * to one RPG aura trait, and carries the explainability fields the schema
 * (docs/architecture/02-data-schema.md `aura.derivedFrom`) requires: every
 * trait on a PawBall can point back at the exact CV reading that produced
 * it. Fully deterministic — no seed, no model.
 */

export interface AuraRule {
  /** CV feature this rule reads (matches a key path in the CV result). */
  sourceFeature: string;
  /** The feature value this rule fires on. */
  sourceValue: string;
  /** The aura trait granted. */
  trait: string;
}

export const AURA_RULES: readonly AuraRule[] = [
  // pose
  { sourceFeature: "pose", sourceValue: "sleeping", trait: "Dream Affinity" },
  { sourceFeature: "pose", sourceValue: "loaf", trait: "Serene Composure" },
  { sourceFeature: "pose", sourceValue: "running", trait: "Swift Instinct" },
  { sourceFeature: "pose", sourceValue: "sitting", trait: "Watchful Presence" },
  { sourceFeature: "pose", sourceValue: "standing", trait: "Bold Bearing" },

  // eye openness
  { sourceFeature: "eyeOpenness", sourceValue: "closed", trait: "Inner Sight" },
  { sourceFeature: "eyeOpenness", sourceValue: "half", trait: "Half-Lidded Cunning" },
  { sourceFeature: "eyeOpenness", sourceValue: "open", trait: "Piercing Gaze" },

  // ear orientation
  { sourceFeature: "earOrientation", sourceValue: "forward", trait: "Guardian Instinct" },
  { sourceFeature: "earOrientation", sourceValue: "alert", trait: "Guardian Instinct" },
  { sourceFeature: "earOrientation", sourceValue: "relaxed", trait: "Calm Aura" },
  { sourceFeature: "earOrientation", sourceValue: "flat", trait: "Storm Temper" },

  // age
  { sourceFeature: "estimatedAgeGroup", sourceValue: "kitten", trait: "Untapped Potential" },
  { sourceFeature: "estimatedAgeGroup", sourceValue: "adult", trait: "Prime Vigor" },
  { sourceFeature: "estimatedAgeGroup", sourceValue: "senior", trait: "Elder Wisdom" },

  // coat pattern
  { sourceFeature: "coatPattern", sourceValue: "tabby", trait: "Wild Lineage" },
  { sourceFeature: "coatPattern", sourceValue: "calico", trait: "Trickster's Fortune" },
  { sourceFeature: "coatPattern", sourceValue: "tortoiseshell", trait: "Trickster's Fortune" },
  { sourceFeature: "coatPattern", sourceValue: "tuxedo", trait: "Formal Grace" },
  { sourceFeature: "coatPattern", sourceValue: "bicolor", trait: "Formal Grace" },
  { sourceFeature: "coatPattern", sourceValue: "solid", trait: "Pure Essence" },
  { sourceFeature: "coatPattern", sourceValue: "spotted", trait: "Hunter's Mark" },

  // tail visibility (heuristic bool -> string "true"/"false")
  { sourceFeature: "tailVisible", sourceValue: "true", trait: "Balanced Spirit" },
  { sourceFeature: "tailVisible", sourceValue: "false", trait: "Hidden Reserves" },

  // environment (primary surrounding label)
  { sourceFeature: "surroundings", sourceValue: "forest", trait: "Verdant Bond" },
  { sourceFeature: "surroundings", sourceValue: "trees", trait: "Verdant Bond" },
  { sourceFeature: "surroundings", sourceValue: "water", trait: "Tidecaller" },
  { sourceFeature: "surroundings", sourceValue: "beach", trait: "Tidecaller" },
  { sourceFeature: "surroundings", sourceValue: "night", trait: "Nightborn" },
  { sourceFeature: "surroundings", sourceValue: "fog", trait: "Nightborn" },
  { sourceFeature: "surroundings", sourceValue: "temple", trait: "Sanctified" },
  { sourceFeature: "surroundings", sourceValue: "street", trait: "City-Wise" },
  { sourceFeature: "surroundings", sourceValue: "urban alley", trait: "City-Wise" },
  { sourceFeature: "surroundings", sourceValue: "marketplace", trait: "City-Wise" },
  { sourceFeature: "surroundings", sourceValue: "mountain", trait: "Peakborn" },
  { sourceFeature: "surroundings", sourceValue: "rain", trait: "Rain-Blessed" },
];

/** Trait used when a PawBall somehow matches no rule at all (empty CV). */
export const DEFAULT_AURA_TRAIT = "Wandering Spirit";

/** Hard cap on traits per PawBall, keeping the card readable. */
export const MAX_AURA_TRAITS = 5;
