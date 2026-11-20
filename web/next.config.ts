import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    // Fotos del catálogo (bucket público "catalogo" de Supabase Storage)
    remotePatterns: [{ protocol: "https", hostname: "*.supabase.co", pathname: "/storage/v1/object/public/catalogo/**" }],
  },
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
