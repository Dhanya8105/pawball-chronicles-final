/**
 * apps/api/src/modules/map/map.service.ts
 *
 * Read side for the Leaflet map. `markersInBox` is viewport-scoped (a
 * collection can span a whole city over time — an unbounded marker fetch
 * would not scale on the client), and returns one marker per PawBall at its
 * most recent sighting location within the box.
 */

import type {
  BondLevel,
  MapMarker,
  MapMarkerDetail,
  Rarity,
} from "@pawball/shared-types";
import { Types } from "mongoose";
import { ApiError } from "../../middleware/errorHandler";
import { PawBallModel } from "../../models/PawBall";
import { SightingModel } from "../../models/Sighting";
import { thumbnailFor } from "../pawball/pawball.serialize";

export interface BBox {
  minLng: number;
  minLat: number;
  maxLng: number;
  maxLat: number;
}

export function parseBBox(raw: unknown): BBox {
  if (typeof raw !== "string") {
    throw new ApiError(
      400,
      "VALIDATION_ERROR",
      "bbox query param is required: bbox=minLng,minLat,maxLng,maxLat"
    );
  }
  const parts = raw.split(",").map((p) => Number(p.trim()));
  if (parts.length !== 4 || parts.some((n) => !Number.isFinite(n))) {
    throw new ApiError(
      400,
      "VALIDATION_ERROR",
      "bbox must be four numbers: minLng,minLat,maxLng,maxLat"
    );
  }
  const [minLng, minLat, maxLng, maxLat] = parts as [
    number,
    number,
    number,
    number,
  ];
  return { minLng, minLat, maxLng, maxLat };
}

export async function markersInBox(
  ownerId: string,
  box: BBox
): Promise<MapMarker[]> {
  const rows = await SightingModel.aggregate([
    {
      $match: {
        ownerId: toObjectId(ownerId),
        pawballId: { $ne: null },
        location: {
          $geoWithin: {
            $box: [
              [box.minLng, box.minLat],
              [box.maxLng, box.maxLat],
            ],
          },
        },
      },
    },
    { $sort: { capturedAt: -1 } },
    {
      $group: {
        _id: "$pawballId",
        coordinates: { $first: "$location.coordinates" },
      },
    },
    {
      $lookup: {
        from: "pawballs",
        localField: "_id",
        foreignField: "_id",
        as: "pawball",
      },
    },
    { $unwind: "$pawball" },
  ]);

  return (rows as Array<Record<string, unknown>>).map((row) => {
    const [lng, lat] = (row.coordinates as [number, number]) ?? [0, 0];
    const pawball = row.pawball as Record<string, unknown>;
    const identity = (pawball.identity ?? {}) as { rarity?: Rarity };
    return {
      pawballId: String(row._id),
      lat,
      lng,
      thumbnailUrl: thumbnailFor(pawball as never),
      rarity: (identity.rarity ?? "common") as Rarity,
    };
  });
}

export async function markerDetail(
  ownerId: string,
  pawballId: string
): Promise<MapMarkerDetail> {
  if (!/^[a-fA-F0-9]{24}$/.test(pawballId)) {
    throw new ApiError(404, "NOT_FOUND", "PawBall not found.");
  }
  const pawball = await PawBallModel.findOne({ _id: pawballId, ownerId }).lean();
  if (!pawball) {
    throw new ApiError(404, "NOT_FOUND", "PawBall not found.");
  }

  const latest = await SightingModel.findOne({ pawballId })
    .sort({ capturedAt: -1 })
    .lean();

  const coords =
    (latest?.location as { coordinates?: [number, number] } | undefined)
      ?.coordinates ?? [0, 0];
  const identity = (pawball.identity ?? {}) as MapMarkerDetail["identity"];
  const bond = (pawball.bond ?? {}) as { level?: BondLevel; lastSeenAt?: Date };
  const homeRegion = (pawball.homeRegion ?? {}) as { name?: string };
  const loreText = (pawball.loreText as string) ?? "";

  return {
    pawballId: String(pawball._id),
    identity: {
      fantasyName: identity.fantasyName ?? "",
      title: identity.title ?? "",
      class: identity.class ?? "",
      rarity: (identity.rarity ?? "common") as Rarity,
      element: identity.element ?? "",
    },
    thumbnailUrl: thumbnailFor(pawball as never),
    artworkUrl:
      ((pawball.artwork as { currentImageUrl?: string })?.currentImageUrl ||
        (pawball.originalPhotoUrl as string)) ??
      "",
    storySnippet: firstSentence(loreText),
    lat: coords[1],
    lng: coords[0],
    regionName: homeRegion.name ?? "",
    lastSeenAt: (bond.lastSeenAt
      ? new Date(bond.lastSeenAt)
      : new Date(0)
    ).toISOString(),
    bondLevel: (bond.level ?? "stranger") as BondLevel,
  };
}

function firstSentence(text: string): string {
  if (!text) return "";
  const match = text.match(/^.*?[.!?](\s|$)/);
  return (match ? match[0] : text).trim();
}

function toObjectId(id: string): Types.ObjectId {
  return new Types.ObjectId(id);
}
