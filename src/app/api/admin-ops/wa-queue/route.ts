import { NextResponse } from "next/server";
import { handle, readJson, ApiError } from "@/lib/api";
import { requireManager } from "@/lib/permissions";
import { whatsappConfigured, ingestInboundWhatsapp } from "@/lib/whatsapp";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// ---------------------------------------------------------------------------
// תור ההתראות של Green API. כשדחיפת ה-webhooks נתקעת אצלם, ההודעות מחכות
// בתור (עד 24 שעות). GET מציץ בראש התור בלי למחוק; POST מנקז: מושך כל
// התראה, מזרים אותה דרך אותו עיבוד של ה-webhook (כלום לא הולך לאיבוד),
// ומוחק מהתור — עד שהתור ריק.
// ---------------------------------------------------------------------------

function base(): string {
  return (process.env.GREENAPI_API_URL || "https://api.green-api.com").replace(/\/$/, "");
}
function creds() {
  return { id: process.env.GREENAPI_ID_INSTANCE!, token: process.env.GREENAPI_API_TOKEN! };
}

async function receiveOne(): Promise<{ receiptId: number; body: any } | null> {
  const { id, token } = creds();
  const res = await fetch(`${base()}/waInstance${id}/receiveNotification/${token}?receiveTimeout=5`);
  if (!res.ok) throw new ApiError(502, `Green API receiveNotification HTTP ${res.status}`);
  const j = await res.json().catch(() => null);
  if (!j || !j.receiptId) return null;
  return { receiptId: j.receiptId, body: j.body };
}

async function deleteOne(receiptId: number): Promise<void> {
  const { id, token } = creds();
  await fetch(`${base()}/waInstance${id}/deleteNotification/${token}/${receiptId}`, { method: "DELETE" });
}

// GET — הצצה לא-הרסנית בראש התור (ההתראה נשארת בתור).
export const GET = handle(async () => {
  await requireManager();
  if (!whatsappConfigured()) throw new ApiError(400, "וואטסאפ אינו מוגדר");
  const head = await receiveOne();
  if (!head) return NextResponse.json({ queueEmpty: true });
  const b = head.body || {};
  return NextResponse.json({
    queueEmpty: false,
    head: {
      type: b.typeWebhook ?? null,
      timestamp: b.timestamp ? new Date(b.timestamp * 1000).toISOString() : null,
      chat: b.senderData?.chatId ?? null,
      msgType: b.messageData?.typeMessage ?? null,
    },
  });
});

// POST {max?} — ניקוז התור: עיבוד כל התראה דרך ingestInboundWhatsapp ומחיקה.
export const POST = handle(async (req) => {
  await requireManager();
  if (!whatsappConfigured()) throw new ApiError(400, "וואטסאפ אינו מוגדר");
  const body = await readJson(req).catch(() => ({}) as Record<string, unknown>);
  const max = Math.min(Math.max(Number((body as any)?.max) || 100, 1), 300);

  const results: { type: string | null; at: string | null; stored?: boolean; reason?: string }[] = [];
  for (let i = 0; i < max; i++) {
    const item = await receiveOne();
    if (!item) break;
    const b = item.body || {};
    let stored = false;
    let reason: string | undefined;
    try {
      const r = await ingestInboundWhatsapp(b);
      stored = r.stored;
      reason = r.reason;
    } catch (e: any) {
      reason = `error: ${String(e?.message || e).slice(0, 120)}`;
    }
    // מוחקים גם אם העיבוד נכשל — התראה רעילה לא תחסום את התור שוב.
    await deleteOne(item.receiptId);
    results.push({
      type: b.typeWebhook ?? null,
      at: b.timestamp ? new Date(b.timestamp * 1000).toISOString() : null,
      stored,
      reason,
    });
  }
  return NextResponse.json({ drained: results.length, results });
});
