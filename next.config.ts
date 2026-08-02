import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  deploymentId: process.env.DEPLOYMENT_ID,
  poweredByHeader: false,
  compress: true,
  serverExternalPackages: ["ssh2"],
  outputFileTracingExcludes: {
    "*": [
      "deploy/**/*",
      "docs/**/*",
      "tests/**/*",
      ".next/cache/**/*",
      "node_modules/@swc/core-*/**/*",
      "node_modules/@esbuild/**/*",
      "node_modules/esbuild/**/*",
      "node_modules/typescript/**/*",
      "node_modules/prisma/**/*",
      "node_modules/@prisma/engines/**/*",
      "node_modules/.cache/**/*",
      "**/*.map",
      "**/*.md",
      "**/CHANGELOG*",
      "**/LICENSE*",
    ],
  },
  images: {
    minimumCacheTTL: 86_400,
    formats: ["image/avif", "image/webp"],
  },
};

export default nextConfig;
