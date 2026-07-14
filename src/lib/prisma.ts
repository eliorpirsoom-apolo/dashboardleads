import { PrismaClient } from "@prisma/client";

// ---------------------------------------------------------------------------
// Single Prisma client for the whole app.
//
// The SQL dialect is baked in at `prisma generate` time:
//   - Local dev:   client generated from prisma/schema.sqlite.prisma
//                  (npm run db:dev) against DATABASE_URL=file:./dev.db
//   - Production:  client generated from prisma/schema.prisma (PostgreSQL)
//                  during `vercel-build` against the hosted Postgres.
// The models are identical, so application code is the same everywhere.
// ---------------------------------------------------------------------------

function createPrisma(): PrismaClient {
  return new PrismaClient({
    log:
      process.env.NODE_ENV === "development"
        ? ["error", "warn"]
        : ["error"],
  });
}

// Reuse a single instance across hot reloads in development.
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma = globalForPrisma.prisma ?? createPrisma();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
