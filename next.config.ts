import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
  compress: true,
  images: {
    minimumCacheTTL: 86_400,
    formats: ["image/avif", "image/webp"],
  },
};

export default nextConfig;
