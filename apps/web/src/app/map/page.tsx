"use client";

/**
 * apps/web/src/app/map/page.tsx
 *
 * MapView is loaded with ssr:false — Leaflet reads `window` at import time,
 * which would crash server rendering.
 */

import dynamic from "next/dynamic";

const MapView = dynamic(
  () => import("@/components/map/MapView").then((m) => m.MapView),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-[70vh] items-center justify-center text-sm text-muted">
        Unrolling the map…
      </div>
    ),
  }
);

export default function MapPage() {
  return <MapView />;
}
