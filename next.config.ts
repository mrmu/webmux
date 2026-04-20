import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  allowedDevOrigins: ["webmux.test"],
  generateBuildId: async () => {
    return `build-${Date.now()}`;
  },
};

export default nextConfig;
