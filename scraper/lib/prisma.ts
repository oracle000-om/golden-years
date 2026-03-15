/**
 * Shared Prisma Client Factory (Singleton)
 *
 * Centralizes the PrismaClient + Neon adapter instantiation.
 * Returns the SAME client instance on every call — this prevents
 * connection pool proliferation when retry-queue, scrape-run, and
 * scraper runners all call createPrismaClient() independently.
 */

import { PrismaClient } from '../../src/generated/prisma/client';
import { PrismaNeonHttp } from '@prisma/adapter-neon';

let _instance: PrismaClient | null = null;

export async function createPrismaClient(): Promise<PrismaClient> {
    if (_instance) return _instance;

    const url = process.env.DATABASE_URL;
    if (!url) throw new Error('DATABASE_URL required. Set it in .env');
    const adapter = new PrismaNeonHttp(url, { arrayMode: false, fullResults: true });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    _instance = new (PrismaClient as any)({ adapter }) as PrismaClient;
    return _instance;
}
