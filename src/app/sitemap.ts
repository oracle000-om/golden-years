import type { MetadataRoute } from 'next';
import { prisma } from '@/lib/db';

export const revalidate = 3600; // regenerate hourly

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
    const baseUrl = 'https://goldenyears.club';

    // Static pages
    const staticPages: MetadataRoute.Sitemap = [
        { url: baseUrl, lastModified: new Date(), changeFrequency: 'hourly', priority: 1.0 },
        { url: `${baseUrl}/about`, lastModified: new Date(), changeFrequency: 'monthly', priority: 0.7 },
        { url: `${baseUrl}/best-of-breed`, lastModified: new Date(), changeFrequency: 'weekly', priority: 0.6 },
        { url: `${baseUrl}/poll`, lastModified: new Date(), changeFrequency: 'weekly', priority: 0.5 },
        { url: `${baseUrl}/give`, lastModified: new Date(), changeFrequency: 'monthly', priority: 0.4 },
    ];

    // Dynamic animal pages — active listings only
    const animals = await prisma.animal.findMany({
        where: { status: { in: ['AVAILABLE', 'URGENT'] }, photoUrl: { not: null } },
        select: { id: true, updatedAt: true },
        orderBy: { updatedAt: 'desc' },
        take: 5000, // cap for sitemap size
    });

    const animalPages: MetadataRoute.Sitemap = animals.map((a) => ({
        url: `${baseUrl}/animal/${a.id}`,
        lastModified: a.updatedAt,
        changeFrequency: 'daily' as const,
        priority: 0.8,
    }));

    // Dynamic shelter pages
    const shelters = await prisma.shelter.findMany({
        where: { animals: { some: { status: { in: ['AVAILABLE', 'URGENT'] } } } },
        select: { id: true, lastScrapedAt: true },
        orderBy: { lastScrapedAt: 'desc' },
        take: 1000,
    });

    const shelterPages: MetadataRoute.Sitemap = shelters.map((s) => ({
        url: `${baseUrl}/shelter/${s.id}`,
        lastModified: s.lastScrapedAt ?? new Date(),
        changeFrequency: 'daily' as const,
        priority: 0.6,
    }));

    return [...staticPages, ...animalPages, ...shelterPages];
}
