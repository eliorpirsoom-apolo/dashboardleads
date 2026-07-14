// Regenerates the single "init" PostgreSQL migration from schema.prisma,
// entirely offline (no live Postgres needed) via `prisma migrate diff`.
//
// Pre-launch we keep ONE init migration and regenerate it on schema changes.
// After the production DB goes live, stop using this and switch to normal
// `prisma migrate dev` against the hosted Postgres.

import { execSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const dir = path.join(root, "prisma", "migrations", "0001_init");
mkdirSync(dir, { recursive: true });

const sql = execSync(
  "npx prisma migrate diff --from-empty --to-schema-datamodel prisma/schema.prisma --script",
  { cwd: root, encoding: "utf8" }
);

writeFileSync(path.join(dir, "migration.sql"), sql);
writeFileSync(
  path.join(root, "prisma", "migrations", "migration_lock.toml"),
  'provider = "postgresql"\n'
);
console.log("PostgreSQL init migration written to prisma/migrations/0001_init");
