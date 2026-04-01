import { PrismaClient } from '../generated/prisma';

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

// Railway persistent server: single long-lived process reuses the same pool,
// so 5 connections is safe and prevents parallel queries from serializing.
const poolLimit = 5;
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
