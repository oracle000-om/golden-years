/* eslint-disable @typescript-eslint/no-explicit-any */
import { PrismaClient } from '../generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

function createPrismaClient(): PrismaClient {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.warn(
      '⚠️  DATABASE_URL is not set. Database queries will fail gracefully. ' +
      'Set DATABASE_URL in your .env file to connect to PostgreSQL.'
    );
    return new Proxy({} as PrismaClient, {
      get(_target, prop) {
        if (typeof prop === 'string' && !['then', 'catch', 'finally', Symbol.toPrimitive, Symbol.toStringTag].includes(prop as any)) {
          return new Proxy(() => { }, {
            get() {
              return () => Promise.reject(
                new Error(`Database not configured: tried to access prisma.${prop}. Set DATABASE_URL in .env.`)
              );
            },
            apply() {
              return Promise.reject(
                new Error(`Database not configured: tried to call prisma.${prop}(). Set DATABASE_URL in .env.`)
              );
            },
          });
        }
        return undefined;
      },
    });
  }

  // Pass PoolConfig directly to PrismaPg (avoids @types/pg version mismatch)
  const adapter = new PrismaPg({
    connectionString,
    max: 1,
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 10_000,
    ssl: connectionString.includes('.rlwy.net') ? { rejectUnauthorized: false } : undefined,
  });
  return new (PrismaClient as any)({ adapter });
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;
