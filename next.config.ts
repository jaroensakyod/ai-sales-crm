import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Postgres client (postgres-js) must stay a real Node module in server bundles.
  serverExternalPackages: ["postgres"],
};

export default nextConfig;
