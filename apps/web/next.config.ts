import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
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
