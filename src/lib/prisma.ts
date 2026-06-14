import { PrismaClient } from "@prisma/client";
import { PrismaLibSQL } from "@prisma/adapter-libsql";
import { createClient } from "@libsql/client";
import path from "path";

// ---------------------------------------------------------------------------
// Prisma client backed by libSQL.
//
// - In production (Vercel) we connect to a hosted Turso database using
//   TURSO_DATABASE_URL + TURSO_AUTH_TOKEN.
// - Locally we fall back to a SQLite file (file:./dev.db) — same libSQL driver,
//   so there is a single code path and identical behaviour everywhere.
// ---------------------------------------------------------------------------

function createPrisma(): PrismaClient {
  // In prod use Turso; locally use the same SQLite file the Prisma CLI manages
  // (the CLI resolves `file:./dev.db` relative to prisma/, i.e. prisma/dev.db).
  // Resolve to an absolute path so it works regardless of the server's cwd.
  const url =
    process.env.TURSO_DATABASE_URL ||
    `file:${path.join(process.cwd(), "prisma", "dev.db")}`;

  const libsql = createClient({
    url,
    authToken: process.env.TURSO_AUTH_TOKEN, // ignored for local file URLs
  });

  const adapter = new PrismaLibSQL(libsql);

  return new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
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
