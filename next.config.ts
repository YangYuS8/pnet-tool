import type { NextConfig } from "next";

const isElectronExport = process.env.PNET_ELECTRON_EXPORT === "1";

const nextConfig: NextConfig = {
  ...(isElectronExport
    ? {
        output: "export" as const,
        trailingSlash: true,
        images: {
          unoptimized: true,
        },
      }
    : {}),
};

export default nextConfig;
