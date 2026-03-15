/**
 * Shared Prisma Client Factory (Singleton)
 *
 * Returns the SAME client instance on every call — this prevents
 * connection proliferation when retry-queue, scrape-run, and
 * scraper runners all call createPrismaClient() independently.
 */

import { PrismaClient } from '../../src/generated/prisma';

let _instance: PrismaClient | null = null;

export async function createPrismaClient(): Promise<PrismaClient> {
    if (_instance) return _instance;

    if (!process.env.DATABASE_URL) {
        throw new Error('DATABASE_URL required. Set it in .env');
    }

    _instance = new PrismaClient();
    return _instance;
}
