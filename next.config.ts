import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The whole app is per-user and time-sensitive, so render at request time.
  cacheComponents: false,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
