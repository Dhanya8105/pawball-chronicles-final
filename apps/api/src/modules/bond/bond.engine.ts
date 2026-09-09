/**
 * apps/api/src/modules/bond/bond.engine.ts
 *
 * Two responsibilities:
 *
 *  1. `resolveBond` — same-cat re-identification. The spec's hardest
 *     requirement: repeated sightings must recognise the same real cat and
 *     must NOT create duplicate companions.
 *
 *     The designed-for mechanism (docs/architecture/02-data-schema.md §"Bond
 *     resolution") is a CLIP face embedding + FAISS nearest-neighbour query
 *     inside services/ai. That embedding endpoint is Milestone 7 scope and
 *     does not exist yet. Until it does, this uses a deterministic
 *     visual-plus-proximity heuristic: a candidate PawBall matches when it
 *     is the same owner, same breed + coat colour + coat pattern, and has a
 *     prior sighting within `MATCH_RADIUS_METERS`. Of the candidates, the
 *     one with the nearest prior sighting wins. This is intentionally
 *     conservative (favours "new cat" when unsure) and is a localised swap
 *     for the FAISS call when it lands — `resolveBond`'s signature and
 *     return shape already match the eventual embedding-backed version.
 *
 *  2. `nextBondLevel` — the relationship state machine: sighting count ->
 *     BondLevel + numeric level for the progress bar.
 */

import type { BondLevel } from "@pawball/shared-types";
import { PawBallModel } from "../../models/PawBall";
import { SightingModel } from "../../models/Sighting";
import type { CvAnalysisResult } from "../../lib/aiServiceClient";

/** Candidate must have a prior sighting within this distance to be judged
 * the same cat. ~250m — tight enough that two different tabbies on opposite
 * sides of a neighbourhood stay separate PawBalls. */
export const MATCH_RADIUS_METERS = 250;

const BOND_LADDER: ReadonlyArray<{
  minSightings: number;
  level: BondLevel;
  levelNumeric: number;
}> = [
  { minSightings: 30, level: "legend", levelNumeric: 5 },
  { minSightings: 15, level: "guardian", levelNumeric: 4 },
  { minSightings: 8, level: "trusted_companion", levelNumeric: 3 },
  { minSightings: 4, level: "friend", levelNumeric: 2 },
  { minSightings: 2, level: "acquaintance", levelNumeric: 1 },
  { minSightings: 0, level: "stranger", levelNumeric: 0 },
];

export function nextBondLevel(sightingCount: number): {
  level: BondLevel;
  levelNumeric: number;
} {
  for (const rung of BOND_LADDER) {
    if (sightingCount >= rung.minSightings) {
      return { level: rung.level, levelNumeric: rung.levelNumeric };
    }
  }
  return { level: "stranger", levelNumeric: 0 };
}

export interface ResolveBondInput {
  ownerId: string;
  cvResult: CvAnalysisResult;
  lat: number;
  lng: number;
}

export interface BondResolution {
  pawballId: string | null;
  isNewPawball: boolean;
  /** [0,1] synthetic score mirroring the eventual cosine-similarity value.
   * null when no match was found. */
  similarityScore: number | null;
}

export async function resolveBond(
  input: ResolveBondInput
): Promise<BondResolution> {
  const breed = input.cvResult.breed.label;
  const { color, pattern } = input.cvResult.coat;

  const candidates = await PawBallModel.find({
    ownerId: input.ownerId,
    "visualProfile.breed": breed,
    "visualProfile.coatColor": color,
    "visualProfile.coatPattern": pattern,
  })
    .select("_id")
    .lean();

  if (candidates.length === 0) {
    return { pawballId: null, isNewPawball: true, similarityScore: null };
  }

  const candidateIds = candidates.map((c) => c._id);

  // Nearest prior sighting of any candidate, within the match radius.
  const nearest = await SightingModel.findOne({
    pawballId: { $in: candidateIds },
    location: {
      $near: {
        $geometry: { type: "Point", coordinates: [input.lng, input.lat] },
        $maxDistance: MATCH_RADIUS_METERS,
      },
    },
  })
    .select("pawballId location")
    .lean();

  if (!nearest || !nearest.pawballId) {
    return { pawballId: null, isNewPawball: true, similarityScore: null };
  }

  const coords = (
    nearest.location as unknown as { coordinates?: number[] }
  ).coordinates;
  const distance =
    coords && coords.length === 2
      ? haversineMeters(
          input.lat,
          input.lng,
          coords[1] as number,
          coords[0] as number
        )
      : MATCH_RADIUS_METERS;

  // Map distance -> a 0.92..1.0 score, echoing the FAISS threshold the real
  // implementation will use. Closer = higher.
  const similarityScore =
    1 - (Math.min(distance, MATCH_RADIUS_METERS) / MATCH_RADIUS_METERS) * 0.08;

  return {
    pawballId: nearest.pawballId.toString(),
    isNewPawball: false,
    similarityScore: Number(similarityScore.toFixed(4)),
  };
}

function haversineMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6_371_000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}
