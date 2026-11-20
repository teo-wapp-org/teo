import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // App mayormente dinámica (sesión por usuario): se usa el modelo de caché clásico.
  // Ver node_modules/next/dist/docs/01-app/02-guides/caching-without-cache-components.md
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
