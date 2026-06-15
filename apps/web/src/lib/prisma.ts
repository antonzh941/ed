import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { Pool } from "pg";

import { getServerEnv, isDatabaseConfigured } from "@/lib/env";

const globalForPrisma = globalThis as typeof globalThis & {
  prisma?: PrismaClient;
  prismaPool?: Pool;
};

export function getPrismaClient() {
  if (!isDatabaseConfigured()) {
    return null;
  }

  if (globalForPrisma.prisma) {
    return globalForPrisma.prisma;
  }

  const pool =
    globalForPrisma.prismaPool ??
    new Pool({
      connectionString: getServerEnv().databaseUrl,
    });
  globalForPrisma.prismaPool = pool;

  const adapter = new PrismaPg(pool);

  const prisma = new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });
  globalForPrisma.prisma = prisma;

  return prisma;
}
