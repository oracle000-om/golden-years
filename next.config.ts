import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      // LA County DACC — Azure Blob Storage
      { protocol: 'https', hostname: 'daccanimalimagesprod.blob.core.windows.net' },
      // OC Animal Care — Pet Adoption Portal
      { protocol: 'https', hostname: 'petadoption.ocpetinfo.com' },
      // RescueGroups CDN
      { protocol: 'https', hostname: '**.rescuegroups.org' },
      // Petango (used by some shelters)
      { protocol: 'https', hostname: '**.petango.com' },
      // Shelter Buddy (used by some shelters)
      { protocol: 'https', hostname: '**.shelterbuddy.com' },
      // ShelterLuv CDN
      { protocol: 'https', hostname: '**.shelterluv.com' },
      // AdoptAPet CDN
      { protocol: 'https', hostname: 'photos.adoptapet.com' },
      // County shelter portals
      { protocol: 'https', hostname: '**.sanantonio.gov' },
      { protocol: 'https', hostname: '**.animalfoundation.com' },
      { protocol: 'https', hostname: '**.sdhumane.org' },
    ],
    deviceSizes: [640, 828, 1080, 1200, 1920],
    imageSizes: [256, 384, 640],
  },
};

export default nextConfig;
