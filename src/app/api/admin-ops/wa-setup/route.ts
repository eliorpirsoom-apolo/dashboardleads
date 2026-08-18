import { NextResponse } from "next/server";
import { handle, requireAdmin, ApiError } from "@/lib/api";
import { whatsappConfigured } from "@/lib/whatsapp";

export const dynamic = "force-dynamic";

function base(): string {
  return (process.env.GREENAPI_API_URL || "https://api.green-api.com").replace(/\/$/, "");
}
function creds() {
  return { id: process.env.GREENAPI_ID_INSTANCE!, token: process.env.GREENAPI_API_TOKEN! };
}

// GET /api/admin-ops/wa-setup — הגדרות ה-webhook + אבחון תיאום טוקן (משרד בלבד).
export const GET = handle(async () => {
  await requireAdmin();
  if (!whatsappConfigured()) throw new ApiError(400, "וואטסאפ אינו מוגדר");
  const { id, token } = creds();
  const [res, stateRes, inRes] = await Promise.all([
    fetch(`${base()}/waInstance${id}/getSettings/${token}`),
    fetch(`${base()}/waInstance${id}/getStateInstance/${token}`),
    // הודעות שנקלטו במופע ב-24 השעות האחרונות — בלי תלות ב-webhooks. אם יש
    // הודעות כאן אבל אין POST-ים אצלנו, גרין-API לא דוחף את ההתראות.
    fetch(`${base()}/waInstance${id}/lastIncomingMessages/${token}?minutes=1440`),
  ]);
  const j = await res.json().catch(() => ({}));
  // authorized = הטלפון מקושר; notAuthorized = נדרשת סריקת QR מחדש בקונסולת Green API.
  const state = await stateRes.json().catch(() => ({}));
  const incoming = await inRes.json().catch(() => null);
  const incomingArr = Array.isArray(incoming) ? incoming : [];
  const newestTs = incomingArr.reduce((m: number, x: any) => Math.max(m, Number(x?.timestamp) || 0), 0);
  const envTok = process.env.GREENAPI_WEBHOOK_TOKEN || "";
  return NextResponse.json({
    idInstance: id,
    stateInstance: state?.stateInstance ?? null,
    webhookUrl: j?.webhookUrl ?? null,
    incomingWebhook: j?.incomingWebhook ?? null,
    incoming24h: inRes.ok ? incomingArr.length : `HTTP ${inRes.status}`,
    incomingNewestAt: newestTs ? new Date(newestTs * 1000).toISOString() : null,
    envLen: envTok.length,
    greenLen: (j?.webhookUrlToken || "").length,
    aligned: Boolean(envTok) && envTok === (j?.webhookUrlToken || ""),
  });
});

// POST /api/admin-ops/wa-setup — הגדרת ה-webhook הנכנס אל המערכת (משרד בלבד).
export const POST = handle(async () => {
  await requireAdmin();
  if (!whatsappConfigured()) throw new ApiError(400, "וואטסאפ אינו מוגדר");
  const secret = process.env.GREENAPI_WEBHOOK_TOKEN;
  if (!secret) throw new ApiError(400, "חסר GREENAPI_WEBHOOK_TOKEN");
  const appUrl = process.env.APP_BASE_URL || "https://dashboard-leads-apollo13.vercel.app";
  const webhookUrl = `${appUrl}/api/webhooks/greenapi`;
  const { id, token } = creds();

  // הגדרה קודמת (לגיבוי/שחזור).
  const prevRes = await fetch(`${base()}/waInstance${id}/getSettings/${token}`);
  const prev = await prevRes.json().catch(() => ({}));

  const res = await fetch(`${base()}/waInstance${id}/setSettings/${token}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      webhookUrl,
      webhookUrlToken: secret,
      incomingWebhook: "yes",
      stateWebhook: "no",
      outgoingWebhook: "no",
      outgoingAPIMessageWebhook: "no",
      outgoingMessageWebhook: "no",
      pollMessageWebhook: "no",
    }),
  });
  const text = await res.text();
  if (!res.ok) throw new ApiError(502, `Green API setSettings ${res.status}: ${text.slice(0, 200)}`);
  return NextResponse.json({
    ok: true,
    webhookUrl,
    previousWebhookUrl: prev?.webhookUrl ?? null,
    note: "Green API עשוי לאתחל את המופע לדקה-שתיים לאחר שינוי הגדרות.",
  });
});
