import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "export",
  trailingSlash: true,
  images: {
    unoptimized: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    // 我们在 package.json 的 typecheck 脚本里独立运行 tsc
    ignoreBuildErrors: true,
  },
};

export default nextConfig;
