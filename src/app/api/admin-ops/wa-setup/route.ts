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
  const [res, stateRes, inRes, outRes] = await Promise.all([
    fetch(`${base()}/waInstance${id}/getSettings/${token}`),
    fetch(`${base()}/waInstance${id}/getStateInstance/${token}`),
    // הודעות שנקלטו במופע ב-24 השעות האחרונות — בלי תלות ב-webhooks. אם יש
    // הודעות כאן אבל אין POST-ים אצלנו, גרין-API לא דוחף את ההתראות.
    fetch(`${base()}/waInstance${id}/lastIncomingMessages/${token}?minutes=1440`),
    // הודעות יוצאות + סטטוס מסירה אמיתי (sent/delivered/read/failed) —
    // מזהה מצב שבו המערכת "שלחה" אבל וואטסאפ לא מסר בפועל.
    fetch(`${base()}/waInstance${id}/lastOutgoingMessages/${token}?minutes=1440`),
  ]);
  const j = await res.json().catch(() => ({}));
  // authorized = הטלפון מקושר; notAuthorized = נדרשת סריקת QR מחדש בקונסולת Green API.
  const state = await stateRes.json().catch(() => ({}));
  const incoming = await inRes.json().catch(() => null);
  const incomingArr = Array.isArray(incoming) ? incoming : [];
  const newestTs = incomingArr.reduce((m: number, x: any) => Math.max(m, Number(x?.timestamp) || 0), 0);
  const outgoing = await outRes.json().catch(() => null);
  const outgoingArr = Array.isArray(outgoing) ? outgoing : [];
  const outStatus: Record<string, number> = {};
  for (const o of outgoingArr) {
    const s = String(o?.statusMessage ?? "unknown");
    outStatus[s] = (outStatus[s] || 0) + 1;
  }
  const outNewest = outgoingArr
    .sort((a: any, b: any) => (b?.timestamp || 0) - (a?.timestamp || 0))
    .slice(0, 8)
    .map((o: any) => ({
      at: o?.timestamp ? new Date(o.timestamp * 1000).toISOString().slice(11, 16) : null,
      status: o?.statusMessage ?? null,
      toTail: String(o?.chatId ?? "").replace(/@.*/, "").slice(-4),
      text: String(o?.textMessage ?? o?.typeMessage ?? "").slice(0, 40),
    }));
  const envTok = process.env.GREENAPI_WEBHOOK_TOKEN || "";
  return NextResponse.json({
    idInstance: id,
    stateInstance: state?.stateInstance ?? null,
    webhookUrl: j?.webhookUrl ?? null,
    incomingWebhook: j?.incomingWebhook ?? null,
    incoming24h: inRes.ok ? incomingArr.length : `HTTP ${inRes.status}`,
    incomingNewestAt: newestTs ? new Date(newestTs * 1000).toISOString() : null,
    outgoing24h: outRes.ok ? outgoingArr.length : `HTTP ${outRes.status}`,
    outgoingStatuses: outStatus,
    outgoingNewest: outNewest,
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

// PATCH /api/admin-ops/wa-setup — ריסטארט למופע (Green API reboot). משחרר
// מופע שנתקע ב-"starting" בלי לסרוק QR מחדש; ההתחברות לטלפון נשמרת.
export const PATCH = handle(async () => {
  await requireAdmin();
  if (!whatsappConfigured()) throw new ApiError(400, "וואטסאפ אינו מוגדר");
  const { id, token } = creds();
  const res = await fetch(`${base()}/waInstance${id}/reboot/${token}`);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(502, `Green API reboot ${res.status}: ${JSON.stringify(data).slice(0, 150)}`);
  return NextResponse.json({ ok: true, isReboot: data?.isReboot ?? null, note: "המופע עולה מחדש — עד 2 דקות" });
});
