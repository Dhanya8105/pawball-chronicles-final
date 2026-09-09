/**
 * apps/api/src/modules/pawball/pawball.service.ts
 *
 * Read/detail logic for a single PawBall: full detail, the merged
 * sightings+memories timeline, raw sighting history, and the memories feed.
 * Plus the one mutation the contract allows — the user-set favourite
 * resting place.
 */

import type {
  MemoryEntry,
  Paginated,
  PawBallDetail,
  SightingRecord,
  TimelineItem,
} from "@pawball/shared-types";
import type { HydratedDocument } from "mongoose";
import { ApiError } from "../../middleware/errorHandler";
import { MemoryModel } from "../../models/Memory";
import { PawBallModel, type PawBallDocument } from "../../models/PawBall";
import { RegionModel } from "../../models/Region";
import { SightingModel } from "../../models/Sighting";
import type { PageParams } from "../../lib/pagination";
import { toPawBallDetail } from "./pawball.serialize";

export async function getOwnedPawball(
  pawballId: string,
  ownerId: string
): Promise<HydratedDocument<PawBallDocument>> {
  if (!isObjectId(pawballId)) {
    throw new ApiError(404, "NOT_FOUND", "PawBall not found.");
  }
  const pawball = await PawBallModel.findOne({ _id: pawballId, ownerId });
  if (!pawball) {
    throw new ApiError(404, "NOT_FOUND", "PawBall not found.");
  }
  return pawball;
}

export async function getPawballDetail(
  pawballId: string,
  ownerId: string
): Promise<PawBallDetail> {
  const pawball = await getOwnedPawball(pawballId, ownerId);
  return toPawBallDetail(pawball);
}

export async function getPawballSightings(
  pawballId: string,
  ownerId: string,
  page: PageParams
): Promise<Paginated<SightingRecord>> {
  await getOwnedPawball(pawballId, ownerId);

  const [rows, total] = await Promise.all([
    SightingModel.find({ pawballId })
      .sort({ capturedAt: -1 })
      .skip(page.skip)
      .limit(page.pageSize)
      .lean(),
    SightingModel.countDocuments({ pawballId }),
  ]);

  const regionNames = await regionNameMap(rows.map((r) => r.regionId));

  return {
    items: rows.map((r) => toSightingRecord(r, regionNames)),
    total,
    page: page.page,
    pageSize: page.pageSize,
  };
}

export async function getPawballMemories(
  pawballId: string,
  ownerId: string,
  page: PageParams,
  type?: string
): Promise<Paginated<MemoryEntry>> {
  await getOwnedPawball(pawballId, ownerId);

  const filter: Record<string, unknown> = { pawballId };
  if (type) filter.type = type;

  const [rows, total] = await Promise.all([
    MemoryModel.find(filter)
      .sort({ occurredAt: -1 })
      .skip(page.skip)
      .limit(page.pageSize)
      .lean(),
    MemoryModel.countDocuments(filter),
  ]);

  return {
    items: rows.map(toMemoryEntry),
    total,
    page: page.page,
    pageSize: page.pageSize,
  };
}

export async function getPawballTimeline(
  pawballId: string,
  ownerId: string,
  page: PageParams
): Promise<Paginated<TimelineItem>> {
  await getOwnedPawball(pawballId, ownerId);

  // Merge two time-ordered streams. Both collections are indexed on
  // (pawballId, <time> desc); we over-fetch `skip + pageSize` from each,
  // merge, then slice — correct and simple at journal-sized page counts.
  const window = page.skip + page.pageSize;

  const [sightings, memories, sightingTotal, memoryTotal] = await Promise.all([
    SightingModel.find({ pawballId })
      .sort({ capturedAt: -1 })
      .limit(window)
      .lean(),
    MemoryModel.find({ pawballId }).sort({ occurredAt: -1 }).limit(window).lean(),
    SightingModel.countDocuments({ pawballId }),
    MemoryModel.countDocuments({ pawballId }),
  ]);

  const regionNames = await regionNameMap(sightings.map((s) => s.regionId));

  const merged: Array<{ at: number; item: TimelineItem }> = [
    ...sightings.map((s) => ({
      at: new Date(s.capturedAt).getTime(),
      item: { kind: "sighting" as const, ...toSightingRecord(s, regionNames) },
    })),
    ...memories.map((m) => ({
      at: new Date(m.occurredAt).getTime(),
      item: { kind: "memory" as const, ...toMemoryEntry(m) },
    })),
  ];
  merged.sort((a, b) => b.at - a.at);

  return {
    items: merged.slice(page.skip, page.skip + page.pageSize).map((e) => e.item),
    total: sightingTotal + memoryTotal,
    page: page.page,
    pageSize: page.pageSize,
  };
}

export async function setFavoriteRestingPlace(
  pawballId: string,
  ownerId: string,
  place: { lat: number; lng: number; label: string }
): Promise<PawBallDetail> {
  const pawball = await getOwnedPawball(pawballId, ownerId);
  pawball.favoriteRestingPlace = place as PawBallDocument["favoriteRestingPlace"];
  await pawball.save();
  return toPawBallDetail(pawball);
}

// --- mappers ---------------------------------------------------------------

async function regionNameMap(
  regionIds: unknown[]
): Promise<Map<string, string>> {
  const ids = [...new Set(regionIds.map((id) => String(id)))];
  if (ids.length === 0) return new Map();
  const regions = await RegionModel.find({ _id: { $in: ids } })
    .select("_id fantasyName")
    .lean();
  return new Map(regions.map((r) => [String(r._id), r.fantasyName]));
}

function toSightingRecord(
  row: Record<string, unknown>,
  regionNames: Map<string, string>
): SightingRecord {
  const location = (row.location ?? {}) as { coordinates?: [number, number] };
  const [lng, lat] = location.coordinates ?? [0, 0];
  return {
    id: String(row._id),
    pawballId: row.pawballId ? String(row.pawballId) : null,
    captureId: String(row.captureId),
    lat,
    lng,
    regionName: regionNames.get(String(row.regionId)) ?? "",
    capturedAt: new Date(row.capturedAt as string).toISOString(),
    cvSnapshot: (row.cvSnapshot ?? null) as SightingRecord["cvSnapshot"],
  };
}

function toMemoryEntry(row: Record<string, unknown>): MemoryEntry {
  return {
    id: String(row._id),
    pawballId: String(row.pawballId),
    type: row.type as MemoryEntry["type"],
    text: String(row.text),
    occurredAt: new Date(row.occurredAt as string).toISOString(),
    createdAt: new Date((row.createdAt ?? row.occurredAt) as string).toISOString(),
  };
}

function isObjectId(value: string): boolean {
  return /^[a-fA-F0-9]{24}$/.test(value);
}
