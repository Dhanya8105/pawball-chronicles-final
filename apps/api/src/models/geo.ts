/**
 * apps/api/src/models/geo.ts
 *
 * Shared GeoJSON Point sub-schema. `sightings` and `regions` both store a
 * `[lng, lat]` coordinate pair (GeoJSON order, NOT lat/lng) so MongoDB's
 * 2dsphere index and `$geoWithin` / `$geoNear` queries work for the map
 * view (see docs/architecture/02-data-schema.md).
 */

import { Schema } from "mongoose";

export const geoPointSchema = new Schema(
  {
    type: { type: String, enum: ["Point"], default: "Point", required: true },
    // [longitude, latitude] — GeoJSON coordinate order.
    coordinates: { type: [Number], required: true },
  },
  { _id: false }
);

export function toGeoPoint(lat: number, lng: number): {
  type: "Point";
  coordinates: [number, number];
} {
  return { type: "Point", coordinates: [lng, lat] };
}
