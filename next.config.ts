import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Postgres client (postgres-js) must stay a real Node module in server bundles.
  serverExternalPackages: ["postgres"],
  experimental: {
    // Product-image uploads run through a server action; the 1MB default is too
    // small for photos.
    serverActions: { bodySizeLimit: "6mb" },
  },
};

export default nextConfig;
