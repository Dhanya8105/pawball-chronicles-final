/**
 * apps/api/src/modules/pawball/pawball.serialize.ts
 *
 * The single place a PawBall Mongoose document becomes an API response
 * object (PawBallSummary / PawBallDetail from @pawball/shared-types). Every
 * read route (collection, map, pawball) goes through here so the wire shape
 * can't drift per-endpoint.
 */

import type {
  BondLevel,
  PawBallDetail,
  PawBallStats,
  PawBallSummary,
  Rarity,
} from "@pawball/shared-types";
import type { PawBallDocument } from "../../models/PawBall";

/** Accepts either a hydrated document or a `.lean()` object. */
type PawBallLike = PawBallDocument | (Record<string, unknown> & { _id: unknown });

function idString(value: unknown): string {
  return value == null ? "" : String(value);
}

function iso(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "string") return value;
  return new Date(0).toISOString();
}

export function thumbnailFor(pb: PawBallLike): string {
  const artwork = (pb as Record<string, unknown>).artwork as
    | { currentImageUrl?: string }
    | undefined;
  const original = (pb as Record<string, unknown>).originalPhotoUrl as
    | string
    | undefined;
  return artwork?.currentImageUrl || original || "";
}

function statsOf(pb: PawBallLike): PawBallStats {
  const s = ((pb as Record<string, unknown>).stats ?? {}) as Partial<PawBallStats>;
  return {
    attack: s.attack ?? 50,
    defense: s.defense ?? 50,
    agility: s.agility ?? 50,
    spirit: s.spirit ?? 50,
    wisdom: s.wisdom ?? 50,
  };
}

export function toPawBallSummary(pb: PawBallLike): PawBallSummary {
  const record = pb as Record<string, unknown>;
  const identity = (record.identity ?? {}) as PawBallSummary["identity"];
  const visualProfile = (record.visualProfile ?? {}) as { breed?: string };
  const bond = (record.bond ?? {}) as { level?: BondLevel; lastSeenAt?: unknown };
  const homeRegion = (record.homeRegion ?? {}) as { name?: string };

  return {
    id: idString(record._id),
    identity: {
      fantasyName: identity.fantasyName ?? "",
      title: identity.title ?? "",
      class: identity.class ?? "",
      rarity: (identity.rarity ?? "common") as Rarity,
      element: identity.element ?? "",
    },
    thumbnailUrl: thumbnailFor(pb),
    bondLevel: (bond.level ?? "stranger") as BondLevel,
    breed: visualProfile.breed ?? "unknown",
    regionName: homeRegion.name ?? "",
    lastSeenAt: iso(bond.lastSeenAt),
  };
}

export function toPawBallDetail(pb: PawBallLike): PawBallDetail {
  const record = pb as Record<string, unknown>;
  const summary = toPawBallSummary(pb);

  const visualProfile = (record.visualProfile ?? {}) as Record<string, unknown>;
  const abilities = (record.abilities ?? {}) as PawBallDetail["abilities"];
  const aura = (record.aura ?? {}) as PawBallDetail["aura"];
  const bond = (record.bond ?? {}) as Record<string, unknown>;
  const artwork = (record.artwork ?? {}) as { currentImageUrl?: string };
  const titlesEarned = (record.titlesEarned ?? []) as Array<{
    title: string;
    earnedAt: unknown;
    reason: string;
  }>;
  const resting = record.favoriteRestingPlace as
    | { lat: number; lng: number; label: string }
    | null
    | undefined;

  return {
    ...summary,
    visualProfile: {
      breed: (visualProfile.breed as string) ?? "unknown",
      breedConfidence: (visualProfile.breedConfidence as number | null) ?? null,
      coatColor: (visualProfile.coatColor as string) ?? "unknown",
      coatPattern: (visualProfile.coatPattern as string) ?? "unknown",
      estimatedAgeGroup:
        (visualProfile.estimatedAgeGroup as PawBallDetail["visualProfile"]["estimatedAgeGroup"]) ??
        "adult",
    },
    abilities: {
      passive: {
        name: abilities?.passive?.name ?? "",
        description: abilities?.passive?.description ?? "",
      },
      ultimate: {
        name: abilities?.ultimate?.name ?? "",
        description: abilities?.ultimate?.description ?? "",
      },
    },
    aura: {
      traits: aura?.traits ?? [],
      derivedFrom: aura?.derivedFrom ?? [],
    },
    bond: {
      level: (bond.level as BondLevel) ?? "stranger",
      levelNumeric: (bond.levelNumeric as number) ?? 0,
      sightingCount: (bond.sightingCount as number) ?? 0,
      firstSeenAt: iso(bond.firstSeenAt),
      lastSeenAt: iso(bond.lastSeenAt),
    },
    artwork: { currentImageUrl: artwork.currentImageUrl ?? summary.thumbnailUrl },
    originalPhotoUrl: (record.originalPhotoUrl as string) ?? "",
    titlesEarned: titlesEarned.map((t) => ({
      title: t.title,
      earnedAt: iso(t.earnedAt),
      reason: t.reason,
    })),
    stats: statsOf(pb),
    loreText: (record.loreText as string) ?? "",
    personality: (record.personality as string) ?? "",
    favoriteRestingPlace: resting ?? null,
  };
}
