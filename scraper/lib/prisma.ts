/**
 * Shared Prisma Client Factory
 *
 * Centralizes the PrismaClient + PrismaPg adapter instantiation.
 * The PrismaPg adapter constructor requires a type cast due to
 * Prisma 7's incomplete overload types — this is the ONE place
 * we allow it, instead of scattering it across every scraper runner.
 */

import { PrismaClient } from '../../src/generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';

export async function createPrismaClient(): Promise<PrismaClient> {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error('DATABASE_URL required. Set it in .env');
    const pool = new pg.Pool({ connectionString: url });
    const adapter = new PrismaPg(pool);
    // Prisma 7 + PrismaPg: adapter constructor overload lacks clean type.
    // This is the single centralized cast — all scraper runners import from here.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return new (PrismaClient as any)({ adapter }) as PrismaClient;
}
