import crypto from "crypto";
import { prisma } from "./prisma";
import { getTaskAgentConfig, isWhitelisted } from "./taskAgent";
import { sendWhatsappRaw } from "./whatsapp";
import { putObject } from "./storage";
import { matchClientByName } from "./meetingSummary";

// טריגר: "הצעה: <לקוח>" / "הצעת מחיר: <לקוח>" + צילום/קובץ של ההצעה החתומה.
const TRIGGER = /^(?:הצעה|הצעת מחיר|הצעת-מחיר|הצעת־מחיר)\s*[:\-–]?\s*(.+)$/s;

const EXT: Record<string, string> = {
  "application/pdf": "pdf",
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/heic": "heic",
};

// קליטת הצעת מחיר חתומה מהבוט: צילום/קובץ עם כיתוב "הצעה: שם הלקוח".
// מחזיר true אם ההודעה נקראה כפקודת הצעה (שלא תיפול לסוכנים אחרים).
export async function maybeHandleSignedQuote(input: {
  phone: string;
  body: string;
  mediaUrl: string | null;
  mediaMime: string | null;
  mediaName: string | null;
  senderName?: string | null;
}): Promise<boolean> {
  const cfg = await getTaskAgentConfig();
  if (!cfg.enabled) return false;
  if (!isWhitelisted(cfg.allowedNumbers, input.phone)) return false;

  const caption = (input.body || "").trim();
  const m = TRIGGER.exec(caption);
  if (!m) return false;

  const reply = (t: string) => sendWhatsappRaw(input.phone, t).catch(() => {});
  const clientName = m[1].trim().split("\n")[0].trim();

  if (!input.mediaUrl) {
    await reply("📄 כדי לשמור הצעת מחיר חתומה — צרפו *צילום או קובץ PDF* של ההצעה, עם כיתוב ״הצעה: שם הלקוח״.");
    return true;
  }
  const client = await matchClientByName(clientName);
  if (!client) {
    await reply(`לא זיהיתי לקוח בשם ״${clientName}״. נסו שוב עם השם המדויק, למשל: ״הצעה: יורם בונה הארץ״.`);
    return true;
  }
  // דדופ מול משלוחים חוזרים של הוובהוק (אותו לקוח, דקה).
  const recent = await prisma.signedQuote.findFirst({
    where: { clientId: client.id, source: "whatsapp", createdAt: { gt: new Date(Date.now() - 2 * 60 * 1000) } },
    select: { id: true },
  });
  if (recent) return true;

  try {
    const res = await fetch(input.mediaUrl);
    if (!res.ok) throw new Error(`download ${res.status}`);
    const bytes = Buffer.from(await res.arrayBuffer());
    const mime = input.mediaMime || "application/octet-stream";
    const ext = EXT[mime] || (input.mediaName?.split(".").pop() || "bin");
    const baseName =
      input.mediaName && /\.\w+$/.test(input.mediaName)
        ? input.mediaName
        : `הצעה חתומה - ${client.name}.${ext}`;
    const safe = baseName.replace(/[^\w.\-֐-׿]+/g, "_").slice(-120) || `quote.${ext}`;
    const key = `agency/signed-quotes/${crypto.randomUUID()}-${safe}`;
    await putObject(key, bytes, mime);
    await prisma.signedQuote.create({
      data: {
        clientId: client.id,
        fileKey: key,
        fileName: baseName,
        mimeType: mime,
        size: bytes.length,
        source: "whatsapp",
      },
    });
    await reply(`✅ נשמרה הצעת מחיר חתומה ל*${client.name}*. היא גלויה למנהלים בכרטיס הלקוח (טאב סקירה).`);
    return true;
  } catch (e) {
    console.error("[signed-quote-ingest]", e);
    await reply("אירעה שגיאה בשמירת ההצעה. נסו שוב, או העלו ידנית מכרטיס הלקוח.");
    return true;
  }
}
