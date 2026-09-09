import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // react-leaflet v4 (the last version compatible with React 18) initializes
  // its Leaflet map in an effect that isn't idempotent under StrictMode's
  // dev-only double-mount — it throws "Map container is already initialized".
  // Upgrading react-leaflet requires React 19. Until then, StrictMode is off.
  reactStrictMode: false,
  // @pawball/shared-types is consumed straight from its TypeScript source
  // (it is a types-only workspace package with no build step in dev).
  transpilePackages: ["@pawball/shared-types"],
  images: {
    // Cloudinary-hosted original photos + generated artwork, per
    // docs/architecture/01-system-architecture.md storage ownership.
    remotePatterns: [
      {
        protocol: "https",
        hostname: "res.cloudinary.com",
      },
    ],
  },
};

export default nextConfig;
