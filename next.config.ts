import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async headers() {
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
    ];
  },
  images: {
    remotePatterns: [
      // LA County DACC — Azure Blob Storage
      { protocol: 'https', hostname: 'daccanimalimagesprod.blob.core.windows.net' },
      // OC Animal Care — Pet Adoption Portal
      { protocol: 'https', hostname: 'petadoption.ocpetinfo.com' },
      // RescueGroups CDN
      { protocol: 'https', hostname: 'cdn.rescuegroups.org' },
      { protocol: 'https', hostname: 'dl5zpyw5k3jeb.cloudfront.net' },
      // Petango (used by some shelters)
      { protocol: 'https', hostname: 'g.petango.com' },
      { protocol: 'https', hostname: 'images.petango.com' },
      // ShelterLuv CDN
      { protocol: 'https', hostname: 'www.shelterluv.com' },
      { protocol: 'https', hostname: 'cdn.shelterluv.com' },
      // Petfinder CDN (S3 via CloudFront)
      { protocol: 'https', hostname: 'dbw3zep4prcju.cloudfront.net' },
      { protocol: 'https', hostname: 'psl.petfinder.com' },
      { protocol: 'https', hostname: 'photos.petfinder.com' },
      // AdoptAPet CDN
      { protocol: 'https', hostname: 'photos.adoptapet.com' },
      { protocol: 'https', hostname: 'media.adoptapet.com' },
      // Adopt-a-Pet PDP media (S3)
      { protocol: 'https', hostname: 'npus-pr-petfusbbc-pdp-media-service-public-use1-sss.s3.amazonaws.com' },
      // County shelter portals
      { protocol: 'https', hostname: 'www.sanantonio.gov' },
      { protocol: 'https', hostname: 'www.animalfoundation.com' },
      { protocol: 'https', hostname: 'www.sdhumane.org' },
    ],
    deviceSizes: [640, 828, 1080, 1200, 1920],
    imageSizes: [256, 384, 640],
  },
};

export default nextConfig;
