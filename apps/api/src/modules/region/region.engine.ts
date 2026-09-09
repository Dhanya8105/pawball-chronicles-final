/**
 * apps/api/src/modules/region/region.engine.ts
 *
 * Real location -> fantasy region, deterministically and with persistence.
 *
 *   1. Truncate lat/lng to a ~1.1km grid cell -> `realLocationHash`.
 *   2. If a Region already exists for this (owner, cell), reuse it verbatim
 *      — this is the "never repeat regions unnecessarily" guarantee, and it
 *      costs one indexed lookup, no generation.
 *   3. Otherwise: CV surroundings labels -> biome (pure lookup), then a
 *      per-cell seed picks a name + description from that biome's pools, and
 *      the new Region is persisted.
 *
 * The seed is `hash(ownerId + cell + biome)` — deliberately independent of
 * which cat triggered the discovery, so the first cat and the hundredth cat
 * seen in the same place get the same region name.
 */

import { RegionModel } from "../../models/Region";
import { toGeoPoint } from "../../models/geo";
import { computeSeed, makeRng, pick } from "../../lib/seededRandom";
import {
  BIOME_DESCRIPTION_TEMPLATES,
  REGION_NAME_POOLS,
  biomeForSurroundings,
} from "./region.data";
import type { Biome } from "@pawball/shared-types";

export interface ResolveRegionInput {
  ownerId: string;
  lat: number;
  lng: number;
  /** CV surroundings labels, confidence-sorted (highest first). */
  surroundings: string[];
  capturedAt: Date;
}

export interface ResolvedRegion {
  regionId: string;
  fantasyName: string;
  description: string;
  biome: Biome;
}

/** ~1.1km grid cell key. Nearby coordinates collapse to the same string. */
export function locationHash(lat: number, lng: number): string {
  return `${lat.toFixed(2)}:${lng.toFixed(2)}`;
}

/**
 * Fuse an adjective onto a noun whose first syllable is lower-case
 * ("Moss" + "shade Thicket"). Drops the noun's leading letter when it
 * repeats the adjective's trailing letter so the seam never doubles up
 * ("Moss" + "shade" -> "Mosshade", not "Mossshade"; "Pearl" + "light" ->
 * "Pearlight"). Pure string op — it does not touch the RNG, so seeded
 * output for non-colliding pairs is unchanged.
 */
export function fuseName(adjective: string, noun: string): string {
  if (adjective.slice(-1).toLowerCase() === noun.charAt(0).toLowerCase()) {
    return adjective + noun.slice(1);
  }
  return adjective + noun;
}

export function generateRegionIdentity(
  ownerId: string,
  cell: string,
  biome: Biome
): { fantasyName: string; description: string } {
  const rng = makeRng(computeSeed([ownerId, cell, biome]));
  const pool = REGION_NAME_POOLS[biome];
  const fantasyName = fuseName(pick(rng, pool.adjectives), pick(rng, pool.nouns));
  const description = pick(rng, BIOME_DESCRIPTION_TEMPLATES[biome]);
  return { fantasyName, description };
}

export async function resolveRegion(
  input: ResolveRegionInput
): Promise<ResolvedRegion> {
  const cell = locationHash(input.lat, input.lng);

  const existing = await RegionModel.findOne({
    ownerId: input.ownerId,
    realLocationHash: cell,
  });
  if (existing) {
    return {
      regionId: existing._id.toString(),
      fantasyName: existing.fantasyName,
      description: existing.description,
      biome: existing.biome as Biome,
    };
  }

  const biome = biomeForSurroundings(input.surroundings);
  const { fantasyName, description } = generateRegionIdentity(
    input.ownerId,
    cell,
    biome
  );

  try {
    const created = await RegionModel.create({
      ownerId: input.ownerId,
      realLocationHash: cell,
      centerPoint: toGeoPoint(input.lat, input.lng),
      fantasyName,
      description,
      biome,
      firstDiscoveredAt: input.capturedAt,
    });
    return {
      regionId: created._id.toString(),
      fantasyName,
      description,
      biome,
    };
  } catch (err) {
    // Unique-index race: two captures in the same fresh cell at once. The
    // loser re-reads the winner's row rather than failing the pipeline.
    if (isDuplicateKeyError(err)) {
      const race = await RegionModel.findOne({
        ownerId: input.ownerId,
        realLocationHash: cell,
      });
      if (race) {
        return {
          regionId: race._id.toString(),
          fantasyName: race.fantasyName,
          description: race.description,
          biome: race.biome as Biome,
        };
      }
    }
    throw err;
  }
}

function isDuplicateKeyError(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code: unknown }).code === 11000
  );
}
