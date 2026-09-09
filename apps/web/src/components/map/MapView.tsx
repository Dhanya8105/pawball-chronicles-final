"use client";

/**
 * apps/web/src/components/map/MapView.tsx
 *
 * Leaflet map of the user's sightings. One rarity-coloured circle marker per
 * PawBall at its most recent location; markers are refetched (viewport-
 * scoped, `bbox=`) whenever the map settles after a pan/zoom. Tapping a
 * marker loads the full popup payload.
 *
 * Imported via next/dynamic with ssr:false from app/map/page.tsx — Leaflet
 * touches `window` at module load.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  CircleMarker,
  MapContainer,
  Popup,
  TileLayer,
  useMap,
  useMapEvents,
} from "react-leaflet";
import type { MapMarker, MapMarkerDetail } from "@pawball/shared-types";
import { ApiError, map as mapApi } from "@/lib/api";
import { rarityColor } from "@/components/cards/rarity";
import "leaflet/dist/leaflet.css";

const DEFAULT_CENTER: [number, number] = [20, 0];
const DEFAULT_ZOOM = 2;

export function MapView() {
  const [markers, setMarkers] = useState<MapMarker[]>([]);
  const [error, setError] = useState("");
  const [emptyHint, setEmptyHint] = useState(false);

  const fetchForBounds = useCallback(
    async (bbox: [number, number, number, number]) => {
      try {
        const rows = await mapApi.markers(bbox);
        setMarkers(rows);
        setError("");
        setEmptyHint(rows.length === 0);
      } catch (err) {
        setError(err instanceof ApiError ? err.message : "Couldn't load the map.");
      }
    },
    []
  );

  return (
    <div className="space-y-3">
      <header>
        <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-gold">
          Chronicle
        </p>
        <h1 className="fantasy-name mt-1 text-4xl text-ink">Map</h1>
        <p className="mt-2 text-sm text-muted">
          Where every legend was found. Pan and zoom to load a region.
        </p>
      </header>

      {error && <p className="text-sm text-coral">{error}</p>}
      {emptyHint && !error && (
        <p className="text-xs text-faint">
          No sightings in view — zoom out, or capture a cat to place your first
          marker.
        </p>
      )}

      <div className="overflow-hidden rounded-card border border-hair">
        <MapContainer
          center={DEFAULT_CENTER}
          zoom={DEFAULT_ZOOM}
          scrollWheelZoom
          style={{ height: "62vh", width: "100%" }}
        >
          <TileLayer
            attribution='&copy; OpenStreetMap'
            url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <BoundsWatcher onSettled={fetchForBounds} />
          {markers.map((m) => (
            <MarkerDot key={m.pawballId} marker={m} />
          ))}
        </MapContainer>
      </div>
    </div>
  );
}

function BoundsWatcher({
  onSettled,
}: {
  onSettled: (bbox: [number, number, number, number]) => void;
}) {
  const map = useMap();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const emit = useCallback(() => {
    const b = map.getBounds();
    onSettled([
      b.getWest(),
      b.getSouth(),
      b.getEast(),
      b.getNorth(),
    ]);
  }, [map, onSettled]);

  useEffect(() => {
    emit();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useMapEvents({
    moveend: () => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(emit, 250);
    },
  });

  return null;
}

function MarkerDot({ marker }: { marker: MapMarker }) {
  const [detail, setDetail] = useState<MapMarkerDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const color = rarityColor(marker.rarity);

  const loadDetail = () => {
    if (detail || loading) return;
    setLoading(true);
    mapApi
      .marker(marker.pawballId)
      .then(setDetail)
      .catch(() => undefined)
      .finally(() => setLoading(false));
  };

  return (
    <CircleMarker
      center={[marker.lat, marker.lng]}
      radius={9}
      pathOptions={{
        color,
        weight: 2,
        fillColor: color,
        fillOpacity: 0.55,
      }}
      eventHandlers={{ click: loadDetail, popupopen: loadDetail }}
    >
      <Popup>
        <div className="w-52">
          {detail ? (
            <>
              {detail.thumbnailUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={detail.thumbnailUrl}
                  alt={detail.identity.fantasyName}
                  className="mb-2 h-28 w-full rounded-[10px] object-cover"
                />
              )}
              <p
                className="text-[10px] font-black uppercase tracking-wide"
                style={{ color }}
              >
                {detail.identity.rarity} · {detail.identity.element}
              </p>
              <p className="fantasy-name text-lg leading-tight text-ink">
                {detail.identity.fantasyName}
              </p>
              <p className="text-xs text-muted">{detail.identity.title}</p>
              {detail.storySnippet && (
                <p className="mt-1.5 text-xs leading-snug text-muted">
                  {detail.storySnippet}
                </p>
              )}
              <p className="mt-1 text-[11px] text-faint">
                {detail.regionName} · seen{" "}
                {new Date(detail.lastSeenAt).toLocaleDateString()}
              </p>
            </>
          ) : (
            <p className="py-4 text-center text-xs text-muted">Loading…</p>
          )}
        </div>
      </Popup>
    </CircleMarker>
  );
}
