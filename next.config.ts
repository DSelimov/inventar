import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Качване на снимки на артикули (до 10 MB на файл); по подразбиране е 1 MB.
    serverActions: { bodySizeLimit: "40mb" },
  },
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
