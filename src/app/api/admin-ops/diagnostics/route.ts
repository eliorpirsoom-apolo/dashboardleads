import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { handle } from "@/lib/api";
import { requireManager } from "@/lib/permissions";
import { debugTranscribeNext } from "@/lib/transcription";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// POST /api/admin-ops/diagnostics — מריץ תמלול על השיחה הבאה בתור ומחזיר תוצאה/שגיאה.
export const POST = handle(async () => {
  await requireManager();
  const result = await debugTranscribeNext();
  return NextResponse.json(result);
});

// GET /api/admin-ops/diagnostics — אבחון תשתית למנהל: נוכחות משתני סביבה
// (בוליאני בלבד — לעולם לא ערכים) + תמונת מצב של תור תמלול השיחות.
export const GET = handle(async () => {
  await requireManager();
  const has = (k: string) => Boolean(process.env[k] && String(process.env[k]).length > 0);

  const env = {
    OPENAI_API_KEY: has("OPENAI_API_KEY"),
    CRON_SECRET: has("CRON_SECRET"),
    R2:
      has("R2_ACCOUNT_ID") &&
      has("R2_ACCESS_KEY_ID") &&
      has("R2_SECRET_ACCESS_KEY") &&
      has("R2_BUCKET"),
    SUMIT: has("SUMIT_COMPANY_ID") && has("SUMIT_API_KEY"),
    GREENAPI: has("GREENAPI_ID_INSTANCE") && has("GREENAPI_API_TOKEN"),
    OPENAI_STT_MODEL: process.env.OPENAI_STT_MODEL || "(default) gpt-4o-transcribe",
    OPENAI_SUMMARY_MODEL: process.env.OPENAI_SUMMARY_MODEL || "(default) gpt-4o-mini",
  };

  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const [nullCount, failedCount, pendingCount, doneCount, noSpeech, recNoKey] = await Promise.all([
    prisma.lead.count({ where: { kind: "call", callRecordingUrl: { startsWith: "http" }, callTranscriptStatus: null } }),
    prisma.lead.count({ where: { kind: "call", callTranscriptStatus: "failed" } }),
    prisma.lead.count({ where: { kind: "call", callTranscriptStatus: "pending" } }),
    prisma.lead.count({ where: { kind: "call", callTranscriptStatus: "done" } }),
    prisma.lead.count({ where: { kind: "call", callTranscriptStatus: "no_speech" } }),
    prisma.lead.count({ where: { kind: "call", callRecordingUrl: { startsWith: "http" }, callRecordingKey: null, createdAt: { gte: weekAgo } } }),
  ]);

  return NextResponse.json({
    env,
    transcription: { nullCount, failedCount, pendingCount, doneCount, noSpeech, recNoKey },
  });
});
