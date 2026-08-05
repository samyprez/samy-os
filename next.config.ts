import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      {
        source: "/api/assistant",
        destination: "/api/assistant-v2",
      },
    ];
  },
};

export default nextConfig;
