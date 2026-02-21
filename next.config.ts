import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**',
      },
    ],
    deviceSizes: [640, 828, 1080, 1200, 1920],
    imageSizes: [256, 384, 640],
  },
};

export default nextConfig;
