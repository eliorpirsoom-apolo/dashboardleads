import { prisma } from "./prisma";
import { putObject, getObject } from "./storage";

// סיומת → mime, לקריאת עותק ההקלטה מ-R2 (כשלא מורידים מהספק).
const EXT_TO_MIME: Record<string, string> = {
  mp3: "audio/mpeg",
  wav: "audio/wav",
  m4a: "audio/mp4",
  ogg: "audio/ogg",
  webm: "audio/webm",
  mp4: "audio/mp4",
};

// ---------------------------------------------------------------------------
// תמלול + סיכום שיחות מההקלטה — עצמאי (לא דרך פייקול).
// מקור השמע: קישור ההקלטה (dlink) שפייקול/CheckCall שולח ב-webhook.
// מנוע: OpenAI (Whisper לתמלול עברית + gpt-4o-mini לסיכום). מדלג אם אין מפתח.
// רץ מה-cron: מוריד את ההקלטה, שומר עותק ב-R2, מתמלל, מסכם, ומצרף לליד.
// ---------------------------------------------------------------------------

export function transcriptionConfigured(): boolean {
  return Boolean(process.env.OPENAI_API_KEY);
}

const OPENAI_BASE = process.env.OPENAI_BASE_URL || "https://api.openai.com/v1";

// זיהוי פורמט השמע האמיתי מ-magic bytes — קישורי callindex מגיעים בלי סיומת
// ועם content-type משובש, אז אסור לסמוך על אלה מול ה-STT של OpenAI.
function sniffAudio(b: Buffer): { ext: string; mime: string } | null {
  const at = (i: number, s: string) => b.subarray(i, i + s.length).toString("latin1") === s;
  if (b.length < 12) return null;
  if (at(0, "RIFF") && at(8, "WAVE")) return { ext: "wav", mime: "audio/wav" };
  if (at(0, "OggS")) return { ext: "ogg", mime: "audio/ogg" };
  if (at(0, "fLaC")) return { ext: "flac", mime: "audio/flac" };
  if (at(0, "ID3") || (b[0] === 0xff && (b[1] & 0xe0) === 0xe0)) return { ext: "mp3", mime: "audio/mpeg" };
  if (at(4, "ftyp")) return { ext: "m4a", mime: "audio/mp4" };
  if (b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3) return { ext: "webm", mime: "audio/webm" };
  return null;
}

/** מוריד את קובץ ההקלטה מהספק. מחזיר bytes + mime + סיומת. */
async function downloadAudio(
  url: string
): Promise<{ bytes: Buffer; mime: string; ext: string }> {
  // חלק מהספקים (callindex) חוסמים בקשות בלי User-Agent ומחזירים דף במקום שמע.
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; ApolloCRM/1.0)", Accept: "*/*" },
  });
  if (!res.ok) throw new Error(`הורדת הקלטה נכשלה: HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  // זיהוי HTML לפי תוכן — לא לפי Content-Type (callindex מחזיר header משובש).
  const head = buf.subarray(0, 64).toString("utf8").trim().toLowerCase();
  if (head.startsWith("<!doctype") || head.startsWith("<html") || head.startsWith("<?xml")) {
    throw new Error("הקישור אינו קובץ שמע (התקבל דף)");
  }
  // mime נקי: מחלצים type/subtype תקין מה-header (עמיד ל-"Content-type: audio/mpeg").
  const rawCt = res.headers.get("content-type") || "";
  const m = rawCt.match(/(audio|application|video)\/[a-z0-9.+-]+/i);
  const mime = m ? m[0].toLowerCase() : "audio/mpeg";
  const extFromMime: Record<string, string> = {
    "audio/mpeg": "mp3",
    "audio/mp3": "mp3",
    "audio/wav": "wav",
    "audio/x-wav": "wav",
    "audio/mp4": "m4a",
    "audio/m4a": "m4a",
    "audio/ogg": "ogg",
    "audio/webm": "webm",
  };
  let ext = extFromMime[mime] || "";
  if (!ext) {
    const um = url.split("?")[0].match(/\.(mp3|wav|m4a|ogg|webm|mp4)$/i);
    ext = um ? um[1].toLowerCase() : "mp3";
  }
  return { bytes: buf, mime, ext };
}

/** קריאת תמלול בודדת למודל נתון. */
async function whisperRequest(model: string, bytes: Buffer, ext: string, mime: string): Promise<string> {
  const form = new FormData();
  form.append("file", new Blob([new Uint8Array(bytes)], { type: mime }), `recording.${ext}`);
  form.append("model", model);
  form.append("language", "he");
  // רמז הקשר משפר דיוק בעברית ומצמצם חזרות/המצאות.
  form.append("prompt", "שיחת טלפון בעברית בין נציג מכירות של משרד פרסום/נדל\"ן לבין ליד או לקוח.");
  const res = await fetch(`${OPENAI_BASE}/audio/transcriptions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
    body: form,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`STT(${model}) HTTP ${res.status}: ${text.slice(0, 200)}`);
  try {
    return JSON.parse(text).text ?? "";
  } catch {
    return text;
  }
}

/** תמלול עברית — מנסה את המודל המוגדר, ונופל אוטומטית ל-whisper-1 המוכח בכל כשל. */
async function transcribeAudio(bytes: Buffer, ext: string, mime: string): Promise<string> {
  const primary = process.env.OPENAI_STT_MODEL || "gpt-4o-transcribe";
  try {
    return await whisperRequest(primary, bytes, ext, mime);
  } catch (err) {
    if (primary === "whisper-1") throw err;
    console.error(`[stt] ${primary} נכשל — נופל ל-whisper-1:`, err);
    return await whisperRequest("whisper-1", bytes, ext, mime);
  }
}

/** סיכום שיחת מכירה בעברית, בראשי פרקים. */
async function summarizeCall(
  transcript: string,
  meta: { targetName?: string | null; durationSec?: number | null }
): Promise<string> {
  const sys =
    "אתה עוזר במשרד פרסום ישראלי. תסכם שיחת טלפון עם ליד/לקוח בעברית, " +
    "בראשי פרקים קצרים (3–6 בולטים המתחילים ב-•). התמקד בכוונת המתקשר, מה שביקש, " +
    "תקציב/פרטים רלוונטיים, והצעד הבא הנדרש. בלי הקדמות — רק הבולטים. " +
    "הסתמך אך ורק על מה שנאמר בתמלול — אל תמציא פרטים. אם התמלול קצר, לא ברור או " +
    "רועש מכדי להבין — כתוב בולט אחד: '• התמלול אינו ברור דיו להפקת סיכום.'";
  const user =
    `סכם את השיחה הבאה${meta.targetName ? ` (יעד: ${meta.targetName})` : ""}` +
    `${meta.durationSec ? `, משך ${meta.durationSec} שניות` : ""}:\n\n${transcript}`;
  const res = await fetch(`${OPENAI_BASE}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: process.env.OPENAI_SUMMARY_MODEL || "gpt-4o-mini",
      temperature: 0.3,
      messages: [
        { role: "system", content: sys },
        { role: "user", content: user },
      ],
    }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Summary HTTP ${res.status}: ${text.slice(0, 200)}`);
  try {
    return JSON.parse(text).choices?.[0]?.message?.content?.trim() ?? "";
  } catch {
    return "";
  }
}

const MAX_AUDIO_BYTES = 25 * 1024 * 1024; // מגבלת Whisper

/** עיבוד ליד שיחה בודד: מקור השמע → תמלול → סיכום.
 *  מקור השמע: קודם העותק הקבוע ב-R2 (callRecordingKey) — קישור הספק (callindex)
 *  פג תוקף מהר, ולכן אסור להסתמך עליו בזמן התמלול. רק אם אין עותק — מורידים מהספק. */
async function processLead(lead: {
  id: string;
  callRecordingUrl: string | null;
  callRecordingKey: string | null;
  callTargetName: string | null;
  callDurationSec: number | null;
}): Promise<"done" | "failed" | "no_audio"> {
  let bytes: Buffer | null = null;
  let mime = "audio/mpeg";
  let ext = "mp3";
  let key = lead.callRecordingKey || "";

  // 1. עדיפות: העותק הקבוע ב-R2.
  if (lead.callRecordingKey) {
    try {
      bytes = await getObject(lead.callRecordingKey);
      ext = lead.callRecordingKey.split(".").pop()?.toLowerCase() || "mp3";
      mime = EXT_TO_MIME[ext] || "audio/mpeg";
    } catch (e) {
      console.error("[transcription:r2-read]", lead.id, e);
      bytes = null; // ניפול להורדה מהספק
    }
  }

  // 2. נפילה: הורדה מקישור הספק (אם אין עותק תקין ב-R2).
  if (!bytes || bytes.length === 0) {
    const url = lead.callRecordingUrl;
    if (!url || !/^https?:\/\//i.test(url)) return "no_audio";
    const dl = await downloadAudio(url);
    bytes = dl.bytes;
    mime = dl.mime;
    ext = dl.ext;
    key = `agency/recordings/${lead.id}.${ext}`;
    // שומרים עותק קבוע כדי שהתמלול הבא (וניגון בדשבורד) לא יתלה בספק.
    await putObject(key, bytes, mime).catch((e) => {
      console.error("[transcription:r2]", e);
    });
  }

  if (!bytes || bytes.length === 0) return "no_audio";
  if (bytes.length > MAX_AUDIO_BYTES) throw new Error("הקלטה גדולה מדי לתמלול");

  // זיהוי הפורמט האמיתי מהתוכן — גובר על הסיומת/mime שנגזרו מהקישור.
  const sniff = sniffAudio(bytes);
  if (sniff) {
    ext = sniff.ext;
    mime = sniff.mime;
  }
  const headHex = bytes.subarray(0, 12).toString("hex");

  let transcript: string;
  try {
    transcript = await transcribeAudio(bytes, ext, mime);
  } catch (e: any) {
    throw new Error(`[fmt=${ext} head=${headHex} size=${bytes.length}] ${e?.message || e}`);
  }
  if (!transcript.trim()) {
    // התמלול הצליח אך אין דיבור (שיחה קצרה/שקטה) — סטטוס סופי, בלי ניסיון חוזר.
    await prisma.lead.update({
      where: { id: lead.id },
      data: {
        callRecordingKey: key,
        callSummary: "• לא זוהה דיבור בהקלטה.",
        callTranscriptStatus: "no_speech",
      },
    });
    return "done";
  }
  const summary = await summarizeCall(transcript, {
    targetName: lead.callTargetName,
    durationSec: lead.callDurationSec,
  }).catch(() => "");

  await prisma.lead.update({
    where: { id: lead.id },
    data: {
      callRecordingKey: key,
      callTranscript: transcript.slice(0, 20000),
      callSummary: summary ? summary.slice(0, 8000) : null,
      callTranscriptStatus: "done",
    },
  });
  return "done";
}

/** מוריד את ההקלטה מ-callRecordingUrl ושומר עותק קבוע ב-R2. מחזיר את המפתח. */
export async function saveRecordingToR2(lead: {
  id: string;
  callRecordingUrl: string | null;
}): Promise<string | null> {
  const url = lead.callRecordingUrl;
  if (!url || !/^https?:\/\//i.test(url)) return null;
  const { bytes, mime, ext } = await downloadAudio(url);
  if (bytes.length === 0) return null;
  const key = `agency/recordings/${lead.id}.${ext}`;
  await putObject(key, bytes, mime);
  return key;
}

export interface RecordingRunResult {
  processed: number;
  saved: number;
  failed: number;
}

/**
 * שומר ל-R2 הקלטות של שיחות שטרם נשמרו — ללא תלות במפתח תמלול, כך שההקלטה
 * נשמרת לצמיתות ומתנגנת בדשבורד גם כשהתמלול כבוי. רץ מה-cron.
 */
export async function downloadPendingRecordings(limit = 3): Promise<RecordingRunResult> {
  const result: RecordingRunResult = { processed: 0, saved: 0, failed: 0 };
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const pending = await prisma.lead.findMany({
    where: {
      kind: "call",
      callRecordingKey: null,
      callRecordingUrl: { startsWith: "http" },
      createdAt: { gte: weekAgo },
    },
    orderBy: { createdAt: "asc" },
    take: limit,
    select: { id: true, callRecordingUrl: true },
  });
  for (const lead of pending) {
    result.processed++;
    try {
      const key = await saveRecordingToR2(lead);
      if (key) {
        await prisma.lead.update({ where: { id: lead.id }, data: { callRecordingKey: key } });
        result.saved++;
      } else {
        result.failed++;
      }
    } catch (err) {
      result.failed++;
      console.error("[recording-download]", lead.id, err);
    }
  }
  return result;
}

export interface TranscriptionRunResult {
  processed: number;
  done: number;
  failed: number;
}

/** אבחון: מתמלל את השיחה הבאה בתור ומחזיר את התוצאה + טקסט השגיאה (אם יש)
 *  ישירות — לבדיקה ידנית מהמשרד, בלי להמתין לקרון ובלי לחפש בלוגים. */
export async function debugTranscribeNext(): Promise<{
  configured: boolean;
  leadId: string | null;
  outcome?: string;
  error?: string;
}> {
  if (!transcriptionConfigured()) return { configured: false, leadId: null };
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const lead = await prisma.lead.findFirst({
    where: {
      kind: "call",
      callRecordingUrl: { startsWith: "http" },
      OR: [
        { callTranscriptStatus: null },
        { callTranscriptStatus: { in: ["failed", "pending"] }, createdAt: { gte: weekAgo } },
      ],
    },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      callRecordingUrl: true,
      callRecordingKey: true,
      callTargetName: true,
      callDurationSec: true,
    },
  });
  if (!lead) return { configured: true, leadId: null };
  try {
    const outcome = await processLead(lead);
    if (outcome === "no_audio") {
      await prisma.lead.update({ where: { id: lead.id }, data: { callTranscriptStatus: "no_audio" } });
    }
    return { configured: true, leadId: lead.id, outcome };
  } catch (err: any) {
    await prisma.lead
      .update({ where: { id: lead.id }, data: { callTranscriptStatus: "failed" } })
      .catch(() => {});
    return { configured: true, leadId: lead.id, outcome: "failed", error: String(err?.message || err).slice(0, 500) };
  }
}

/**
 * מעבד לידי שיחה שיש להם הקלטה וטרם תומללו. מוגבל למספר קטן לריצה כדי
 * להישאר תחת מגבלת 60 שניות של Vercel. רץ מה-cron.
 */
export async function processPendingCallTranscriptions(
  limit = 2
): Promise<TranscriptionRunResult> {
  const result: TranscriptionRunResult = { processed: 0, done: 0, failed: 0 };
  if (!transcriptionConfigured()) return result;

  // כולל ניסיון חוזר לכשלים/תקועים מ-7 הימים האחרונים (חלון בטיחות).
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const pending = await prisma.lead.findMany({
    where: {
      kind: "call",
      callRecordingUrl: { startsWith: "http" },
      OR: [
        { callTranscriptStatus: null },
        { callTranscriptStatus: { in: ["failed", "pending"] }, createdAt: { gte: weekAgo } },
      ],
    },
    orderBy: { createdAt: "asc" },
    take: limit,
    select: {
      id: true,
      callRecordingUrl: true,
      callRecordingKey: true,
      callTargetName: true,
      callDurationSec: true,
    },
  });

  for (const lead of pending) {
    result.processed++;
    // סימון "בתהליך" מיד — כדי שריצה מקבילה/הבאה לא תיקח אותו שוב.
    await prisma.lead.update({
      where: { id: lead.id },
      data: { callTranscriptStatus: "pending" },
    });
    try {
      const outcome = await processLead(lead);
      if (outcome === "done") result.done++;
      else {
        result.failed++;
        if (outcome === "no_audio") {
          await prisma.lead.update({
            where: { id: lead.id },
            data: { callTranscriptStatus: "no_audio" },
          });
        }
      }
    } catch (err) {
      result.failed++;
      console.error("[transcription]", lead.id, err);
      await prisma.lead
        .update({ where: { id: lead.id }, data: { callTranscriptStatus: "failed" } })
        .catch(() => {});
    }
  }
  return result;
}
