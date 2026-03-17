import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async headers() {
    const corsOrigins = process.env.CORS_ALLOWED_ORIGINS || '*';
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
          { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' },
        ],
      },
      {
        source: '/api/v1/:path*',
        headers: [
          { key: 'Access-Control-Allow-Origin', value: corsOrigins },
          { key: 'Access-Control-Allow-Methods', value: 'GET, POST, DELETE, OPTIONS' },
          { key: 'Access-Control-Allow-Headers', value: 'Content-Type, X-API-Key, Authorization' },
          { key: 'Access-Control-Max-Age', value: '86400' },
        ],
      },
    ];
  },
  images: {
    unoptimized: true,
    remotePatterns: [
      // Allow any HTTPS image — all URLs come from our own scrapers/DB,
      // so no untrusted user input. Prevents site-wide crashes when a
      // scraper ingests photos from a new CDN hostname.
      { protocol: 'https', hostname: '**' },
    ],
    deviceSizes: [640, 828, 1080, 1200, 1920],
    imageSizes: [256, 384, 640],
  },
};

export default nextConfig;
