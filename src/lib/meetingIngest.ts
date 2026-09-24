import crypto from "crypto";
import { prisma } from "./prisma";
import { getTaskAgentConfig, isWhitelisted } from "./taskAgent";
import { sendWhatsappRaw } from "./whatsapp";
import { putObject } from "./storage";
import {
  extractMeetingFromImage,
  matchClientByName,
  buildMeetingTitle,
} from "./meetingSummary";

const BASE = (process.env.APP_BASE_URL || "https://app.apolloadv.co.il").replace(/\/$/, "");

// טריגר לסיכום פגישה: הכיתוב מתחיל ב"סיכום"/"פגישה" ואחריו שם הלקוח.
const TRIGGER = /^(?:סיכום|סכום|פגישה)\s*[:\-–]?\s*(.+)$/s;

// קליטת סיכום פגישה מהבוט: צילום דף פגישה עם כיתוב "סיכום: שם הלקוח".
// מחזיר true אם ההודעה נקראה כפקודת סיכום (בין אם הצליחה ובין אם לא) — כדי
// שלא תיפול לסוכן המשימות. מחזיר false אם זו לא הודעת סיכום.
export async function maybeHandleMeetingSummary(input: {
  phone: string;
  body: string;
  mediaUrl: string | null;
  mediaMime: string | null;
  idMessage?: string | null;
  senderName?: string | null;
}): Promise<boolean> {
  const cfg = await getTaskAgentConfig();
  if (!cfg.enabled) return false;
  if (!isWhitelisted(cfg.allowedNumbers, input.phone)) return false;

  const caption = (input.body || "").trim();
  const m = TRIGGER.exec(caption);
  if (!m) return false; // לא פקודת סיכום — שמסלולים אחרים יטפלו

  const reply = (t: string) => sendWhatsappRaw(input.phone, t).catch(() => {});

  const clientName = m[1].trim().split("\n")[0].trim();
  if (!input.mediaUrl || !(input.mediaMime || "").startsWith("image/")) {
    await reply("📝 כדי ליצור סיכום פגישה — צרפו *צילום* של דף הפגישה, עם כיתוב כמו: ״סיכום: שם הלקוח״.");
    return true;
  }

  // דדופ מול משלוחים חוזרים של הוובהוק (אותו לקוח, אותה דקה).
  const client = await matchClientByName(clientName);
  if (!client) {
    await reply(`לא זיהיתי לקוח בשם ״${clientName}״. נסו שוב עם שם הלקוח המדויק, למשל: ״סיכום: יורם בונה הארץ״.`);
    return true;
  }
  const recent = await prisma.meetingSummary.findFirst({
    where: { clientId: client.id, source: "whatsapp", createdAt: { gt: new Date(Date.now() - 3 * 60 * 1000) } },
    select: { id: true },
  });
  if (recent) return true; // כנראה משלוח חוזר — כבר נוצר

  try {
    // הורדת התמונה → אחסון ב-R2 + data-URL ל-OCR.
    const res = await fetch(input.mediaUrl);
    if (!res.ok) throw new Error(`download ${res.status}`);
    const bytes = Buffer.from(await res.arrayBuffer());
    const mime = input.mediaMime || "image/jpeg";
    const ext = mime.includes("png") ? "png" : "jpg";
    const key = `agency/meetings/${crypto.randomUUID()}.${ext}`;
    await putObject(key, bytes, mime).catch(() => {});
    const dataUrl = `data:${mime};base64,${bytes.toString("base64")}`;

    let bullets: any[] = [];
    let rawText = "";
    try {
      const ex = await extractMeetingFromImage(dataUrl);
      bullets = ex.bullets;
      rawText = ex.rawText;
    } catch (e) {
      console.error("[meeting-ocr]", e);
    }

    const now = new Date();
    const meeting = await prisma.meetingSummary.create({
      data: {
        clientId: client.id,
        title: buildMeetingTitle(client.name, now),
        meetingDate: now,
        rawText: rawText || null,
        bullets: JSON.stringify(bullets),
        photoKeys: JSON.stringify([key]),
        status: "draft",
        source: "whatsapp",
      },
    });

    const taskCount = bullets.filter((b) => b.isTask).length;
    await reply(
      `✅ נוצר סיכום פגישה ל*${client.name}* עם ${bullets.length} נקודות` +
        (taskCount ? ` (${taskCount} סומנו כמשימה)` : "") +
        `.\nלבדיקה, עריכה ושליחה ללקוח:\n${BASE}/admin/meetings?open=${meeting.id}` +
        (bullets.length === 0 ? `\n\n⚠️ לא הצלחתי לפענח טקסט מהתמונה — הדף מצורף לסיכום, אפשר להשלים ידנית.` : "")
    );
    return true;
  } catch (e) {
    console.error("[meeting-ingest]", e);
    await reply("אירעה שגיאה בעיבוד הסיכום. נסו שוב, או צרו סיכום ידני במערכת.");
    return true;
  }
}
