import { PrismaClient } from '../generated/prisma';

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

// Production (Vercel serverless): small pool to avoid shared memory OOM,
// but enough (3) so Promise.all queries don't serialize behind one connection.
// Local dev: allow more connections so parallel admin queries don't timeout.
const poolLimit = process.env.NODE_ENV === 'production' ? 3 : 5;
const separator = process.env.DATABASE_URL?.includes('?') ? '&' : '?';
const poolParams = `connection_limit=${poolLimit}&pool_timeout=15&statement_timeout=8000&connect_timeout=5`;

export const prisma = globalForPrisma.prisma ?? new PrismaClient({
  datasources: {
    db: {
      url: process.env.DATABASE_URL + separator + poolParams,
    },
  },
});

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;
