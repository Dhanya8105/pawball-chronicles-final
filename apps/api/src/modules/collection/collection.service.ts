/**
 * apps/api/src/modules/collection/collection.service.ts
 *
 * Read side over the user's PawBall collection: server-side
 * search / filter / sort / paginate, plus the header-chip stat counts.
 * Nothing here mutates.
 */

import type {
  BondLevel,
  CollectionResponse,
  CollectionStats,
  Rarity,
} from "@pawball/shared-types";
import { Types, type FilterQuery } from "mongoose";
import { PawBallModel, type PawBallDocument } from "../../models/PawBall";
import { toPawBallSummary } from "../pawball/pawball.serialize";

/** `aggregate()` does NOT auto-cast strings to ObjectId the way `find()`
 * does, so every `$match` on an id field must pass a real ObjectId. */
function oid(id: string): Types.ObjectId {
  return new Types.ObjectId(id);
}

const RARITIES: Rarity[] = ["common", "uncommon", "rare", "epic", "legendary"];
const BOND_LEVELS: BondLevel[] = [
  "stranger",
  "acquaintance",
  "friend",
  "trusted_companion",
  "guardian",
  "legend",
];

/** Numeric rank so "rarity" sort is meaningful (rare > uncommon > common). */
const RARITY_RANK: Record<Rarity, number> = {
  common: 0,
  uncommon: 1,
  rare: 2,
  epic: 3,
  legendary: 4,
};

export interface CollectionQueryInput {
  ownerId: string;
  q?: string;
  sortBy?: string;
  rarity?: string;
  breed?: string;
  regionId?: string;
  bondLevel?: string;
  page: number;
  pageSize: number;
  skip: number;
}

function buildFilter(input: CollectionQueryInput): FilterQuery<PawBallDocument> {
  const filter: FilterQuery<PawBallDocument> = { ownerId: oid(input.ownerId) };

  if (input.rarity && RARITIES.includes(input.rarity as Rarity)) {
    filter["identity.rarity"] = input.rarity;
  }
  if (input.breed) {
    filter["visualProfile.breed"] = input.breed;
  }
  if (input.bondLevel && BOND_LEVELS.includes(input.bondLevel as BondLevel)) {
    filter["bond.level"] = input.bondLevel;
  }
  if (input.regionId && Types.ObjectId.isValid(input.regionId)) {
    filter.$or = [
      { "homeRegion.regionId": oid(input.regionId) },
      { locationsVisited: oid(input.regionId) },
    ];
  }
  if (input.q && input.q.trim()) {
    const rx = new RegExp(escapeRegex(input.q.trim()), "i");
    const search = [
      { "identity.fantasyName": rx },
      { "identity.title": rx },
      { "visualProfile.breed": rx },
      { "homeRegion.name": rx },
    ];
    // Combine with an existing $or (regionId) via $and rather than clobbering.
    if (filter.$or) {
      filter.$and = [{ $or: filter.$or }, { $or: search }];
      delete filter.$or;
    } else {
      filter.$or = search;
    }
  }

  return filter;
}

function sortSpec(sortBy?: string): Record<string, 1 | -1> {
  switch (sortBy) {
    case "name":
      return { "identity.fantasyName": 1 };
    case "rarity":
      return { _rarityRank: -1, "bond.lastSeenAt": -1 };
    case "bond":
      return { "bond.levelNumeric": -1, "bond.lastSeenAt": -1 };
    case "recent":
    default:
      return { "bond.lastSeenAt": -1 };
  }
}

export async function queryCollection(
  input: CollectionQueryInput
): Promise<CollectionResponse> {
  const filter = buildFilter(input);
  const sort = sortSpec(input.sortBy);

  const [items, total] = await Promise.all([
    PawBallModel.aggregate([
      { $match: filter },
      {
        $addFields: {
          _rarityRank: {
            $switch: {
              branches: RARITIES.map((r) => ({
                case: { $eq: ["$identity.rarity", r] },
                then: RARITY_RANK[r],
              })),
              default: 0,
            },
          },
        },
      },
      { $sort: sort },
      { $skip: input.skip },
      { $limit: input.pageSize },
    ]),
    PawBallModel.countDocuments(filter),
  ]);

  return {
    items: (items as Record<string, unknown>[]).map((doc) =>
      toPawBallSummary(doc as never)
    ),
    total,
    page: input.page,
    pageSize: input.pageSize,
  };
}

export async function collectionStats(ownerId: string): Promise<CollectionStats> {
  const [byRarityRows, byBondRows, byBreedRows, byRegionRows, total] =
    await Promise.all([
      PawBallModel.aggregate([
        { $match: { ownerId: oid(ownerId) } },
        { $group: { _id: "$identity.rarity", count: { $sum: 1 } } },
      ]),
      PawBallModel.aggregate([
        { $match: { ownerId: oid(ownerId) } },
        { $group: { _id: "$bond.level", count: { $sum: 1 } } },
      ]),
      PawBallModel.aggregate([
        { $match: { ownerId: oid(ownerId) } },
        { $group: { _id: "$visualProfile.breed", count: { $sum: 1 } } },
        { $sort: { count: -1, _id: 1 } },
      ]),
      PawBallModel.aggregate([
        { $match: { ownerId: oid(ownerId) } },
        { $group: { _id: "$homeRegion.name", count: { $sum: 1 } } },
        { $sort: { count: -1, _id: 1 } },
      ]),
      PawBallModel.countDocuments({ ownerId }),
    ]);

  const byRarity = zeroFill(RARITIES, byRarityRows);
  const byBondLevel = zeroFill(BOND_LEVELS, byBondRows);

  return {
    total,
    byRarity: byRarity as Record<Rarity, number>,
    byBondLevel: byBondLevel as Record<BondLevel, number>,
    byBreed: byBreedRows
      .filter((r) => r._id)
      .map((r) => ({ breed: String(r._id), count: r.count as number })),
    byRegion: byRegionRows
      .filter((r) => r._id)
      .map((r) => ({ regionName: String(r._id), count: r.count as number })),
  };
}

function zeroFill(
  keys: string[],
  rows: Array<{ _id: unknown; count: number }>
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const k of keys) out[k] = 0;
  for (const row of rows) {
    if (row._id != null && out[String(row._id)] !== undefined) {
      out[String(row._id)] = row.count;
    }
  }
  return out;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
