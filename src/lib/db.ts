/* eslint-disable @typescript-eslint/no-explicit-any */
import { PrismaClient } from '../generated/prisma/client';
import { PrismaNeonHttp } from '@prisma/adapter-neon';
import { neonConfig } from '@neondatabase/serverless';

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
    // Return a proxy that throws descriptive errors on any property access,
    // allowing the app to boot and serve non-DB pages
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

  const adapter = new PrismaNeonHttp(connectionString, { arrayMode: false, fullResults: true });
  return new (PrismaClient as any)({ adapter });
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;

