import crypto from "crypto";
import { prisma } from "./prisma";
import { getTaskAgentConfig, isWhitelisted } from "./taskAgent";
import { sendWhatsappRaw } from "./whatsapp";
import { putObject } from "./storage";
import { matchClientByName } from "./meetingSummary";
import { aiVision, aiConfigured } from "./ai";

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

// פענוח מספר שקלים מתוך טקסט AI ("4,500" / "4500 ₪" / 4500) → מספר שלם או null.
function toShekels(v: any): number | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "number") return Number.isFinite(v) ? Math.round(v) : null;
  const n = parseInt(String(v).replace(/[^\d]/g, ""), 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

// קריאת נושא + סכומים מצילום הצעת מחיר (best-effort; תמיד ניתן לעריכה בכרטיס).
async function extractQuoteFromImage(
  dataUrl: string
): Promise<{ title: string | null; amountPreVat: number | null; amountTotal: number | null }> {
  if (!aiConfigured()) return { title: null, amountPreVat: null, amountTotal: null };
  const raw = await aiVision({
    system: "אתה קורא הצעת מחיר ישראלית מצילום ומחזיר JSON בלבד, ללא טקסט נוסף.",
    user:
      'קרא את הצעת המחיר בתמונה והחזר JSON יחיד בלבד: ' +
      '{"title": "נושא קצר של ההצעה — על מה השירות/המוצר, עד 60 תווים בעברית", ' +
      '"amountPreVat": סכום לפני מע"מ בשקלים שלמים או null, ' +
      '"amountTotal": סכום כולל מע"מ (סה"כ לתשלום) בשקלים שלמים או null}. ' +
      'אם ערך לא מופיע בבירור — החזר null עבורו. בלי הסברים, בלי code-fences.',
    imageUrl: dataUrl,
    maxTokens: 300,
  });
  try {
    let s = raw.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
    const a = s.indexOf("{");
    const b = s.lastIndexOf("}");
    if (a >= 0 && b > a) s = s.slice(a, b + 1);
    const o = JSON.parse(s);
    const title = o?.title ? String(o.title).trim().slice(0, 80) : null;
    return { title: title || null, amountPreVat: toShekels(o?.amountPreVat), amountTotal: toShekels(o?.amountTotal) };
  } catch {
    return { title: null, amountPreVat: null, amountTotal: null };
  }
}

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

    // צילום → ניסיון קריאה אוטומטית של נושא + סכומים (ניתן לעריכה בכרטיס).
    let meta = { title: null as string | null, amountPreVat: null as number | null, amountTotal: null as number | null };
    if (mime.startsWith("image/")) {
      try {
        meta = await extractQuoteFromImage(`data:${mime};base64,${bytes.toString("base64")}`);
      } catch (e) {
        console.error("[signed-quote-vision]", e);
      }
    }

    await prisma.signedQuote.create({
      data: {
        clientId: client.id,
        fileKey: key,
        fileName: baseName,
        mimeType: mime,
        size: bytes.length,
        title: meta.title,
        amountPreVat: meta.amountPreVat,
        amountTotal: meta.amountTotal,
        quoteDate: new Date(),
        source: "whatsapp",
      },
    });

    const parts = [meta.title, meta.amountTotal ? `₪${meta.amountTotal.toLocaleString("he-IL")} כולל מע״מ` : null].filter(Boolean);
    const detail = parts.length ? `\n${parts.join(" · ")}` : "";
    const hint = meta.title || meta.amountTotal ? "\n(קראתי את הפרטים אוטומטית — כדאי לוודא/לתקן בכרטיס)" : "";
    await reply(`✅ נשמרה הצעת מחיר חתומה ל*${client.name}*.${detail}\nגלויה למנהלים בכרטיס הלקוח (טאב סקירה).${hint}`);
    return true;
  } catch (e) {
    console.error("[signed-quote-ingest]", e);
    await reply("אירעה שגיאה בשמירת ההצעה. נסו שוב, או העלו ידנית מכרטיס הלקוח.");
    return true;
  }
}
