/* eslint-disable @typescript-eslint/no-explicit-any */
import { PrismaClient } from '../generated/prisma/client';
import { withAccelerate } from '@prisma/extension-accelerate';

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

function createPrismaClient(): PrismaClient {
  const accelerateUrl = process.env.ACCELERATE_URL;
  const databaseUrl = process.env.DATABASE_URL;

  if (!accelerateUrl && !databaseUrl) {
    console.warn(
      '⚠️  Neither ACCELERATE_URL nor DATABASE_URL is set. Database queries will fail gracefully.'
    );
    return new Proxy({} as PrismaClient, {
      get(_target, prop) {
        if (typeof prop === 'string' && !['then', 'catch', 'finally', Symbol.toPrimitive, Symbol.toStringTag].includes(prop as any)) {
          return new Proxy(() => { }, {
            get() {
              return () => Promise.reject(
                new Error(`Database not configured: tried to access prisma.${prop}. Set ACCELERATE_URL or DATABASE_URL.`)
              );
            },
            apply() {
              return Promise.reject(
                new Error(`Database not configured: tried to call prisma.${prop}(). Set ACCELERATE_URL or DATABASE_URL.`)
              );
            },
          });
        }
        return undefined;
      },
    });
  }

  // Prefer Accelerate (HTTPS proxy — no /dev/shm, ideal for Vercel serverless)
  // Falls back to direct pg adapter for local dev / GitHub Actions
  if (accelerateUrl) {
    return new (PrismaClient as any)({
      accelerateUrl,
    }).$extends(withAccelerate()) as PrismaClient;
  }

  // Direct connection fallback (local dev, scrapers)
  const { PrismaPg } = require('@prisma/adapter-pg');
  const adapter = new PrismaPg({
    connectionString: databaseUrl,
    max: 1,
    ssl: databaseUrl!.includes('.rlwy.net') ? { rejectUnauthorized: false } : undefined,
  });
  return new (PrismaClient as any)({ adapter });
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;
