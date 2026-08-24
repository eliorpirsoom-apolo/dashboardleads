import { gzipSync } from "zlib";
import { prisma } from "./prisma";
import { putObject, deleteObject } from "./storage";
import { touchCronHeartbeat, reportExternalIssue, resolveExternalIssue } from "./health";

// ---------------------------------------------------------------------------
// גיבוי שבועי עצמאי: ייצוא הטבלאות העסקיות ל-JSON דחוס ב-R2 — שכבת ביטחון
// שנייה, נפרדת לגמרי מ-Neon (שם יש PITR של 7 ימים). שמירה: 8 גיבויים אחרונים.
// ---------------------------------------------------------------------------

const TABLES = [
  "client",
  "user",
  "project",
  "leadStatus",
  "customFieldDef",
  "leadSource",
  "metaPage",
  "lead",
  "leadNote",
  "leadActivity",
  "task",
  "reminder",
  "unitType",
  "purchaseRequest",
  "contract",
  "designTask",
  "supplierCost",
] as const;

function dateKey(d: Date): string {
  return `backups/weekly-${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}.json.gz`;
}

export async function runWeeklyBackup(): Promise<{
  key: string;
  tables: number;
  rows: number;
  bytes: number;
}> {
  const dump: Record<string, unknown[]> = {};
  let rows = 0;
  for (const t of TABLES) {
    try {
      const data = await (prisma as any)[t].findMany();
      dump[t] = data;
      rows += data.length;
    } catch (err) {
      // טבלה שלא קיימת/נכשלה לא מפילה את הגיבוי כולו — נרשמת ומדולגת.
      console.error(`[backup] table ${t}:`, err);
      dump[t] = [];
    }
  }

  const now = new Date();
  const key = dateKey(now);
  const buf = gzipSync(
    Buffer.from(JSON.stringify({ createdAt: now.toISOString(), tables: dump }))
  );
  await putObject(key, buf, "application/gzip");
  await touchCronHeartbeat("backup", key);

  // שמירת 8 גיבויים: מחיקה (best-effort) של הקובץ מלפני 8 שבועות.
  const old = new Date(now.getTime() - 8 * 7 * 24 * 60 * 60 * 1000);
  await deleteObject(dateKey(old)).catch(() => {});

  await resolveExternalIssue("ext:backup");
  return { key, tables: TABLES.length, rows, bytes: buf.length };
}

export async function runWeeklyBackupSafe(): Promise<unknown> {
  try {
    const r = await runWeeklyBackup();
    console.log(`[backup] ok: ${r.key} (${r.rows} rows, ${Math.round(r.bytes / 1024)}KB)`);
    return r;
  } catch (err) {
    const msg = String((err as Error)?.message ?? err).slice(0, 150);
    console.error("[backup] FAILED:", msg);
    await reportExternalIssue(
      "ext:backup",
      "הגיבוי השבועי נכשל",
      `ייצוא הנתונים ל-R2 נכשל: ${msg}`
    ).catch(() => {});
    return { error: msg };
  }
}
