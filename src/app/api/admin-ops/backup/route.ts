import { NextResponse } from "next/server";
import { handle } from "@/lib/api";
import { requireManager } from "@/lib/permissions";
import { runWeeklyBackupSafe } from "@/lib/backup";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

// POST — הרצת גיבוי מיידית (מנהל בלבד); אותו קוד כמו הקרון השבועי.
export const POST = handle(async () => {
  await requireManager();
  return NextResponse.json(await runWeeklyBackupSafe());
});
