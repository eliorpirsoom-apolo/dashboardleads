import { NextResponse } from "next/server";
import { handle, requireAdmin, ApiError } from "@/lib/api";
import { whatsappConfigured, ingestInboundWhatsapp } from "@/lib/whatsapp";

export const dynamic = "force-dynamic";

function base(): string {
  return (process.env.GREENAPI_API_URL || "https://api.green-api.com").replace(/\/$/, "");
}
function creds() {
  return { id: process.env.GREENAPI_ID_INSTANCE!, token: process.env.GREENAPI_API_TOKEN! };
}

// GET /api/admin-ops/wa-setup — הגדרות ה-webhook + אבחון (משרד בלבד).
// ?selftest=1&phone=<phone> — בדיקת קליטה נכנסת מקצה-לקצה דרך הלוגיקה האמיתית.
export const GET = handle(async (req) => {
  await requireAdmin();
  if (!whatsappConfigured()) throw new ApiError(400, "וואטסאפ אינו מוגדר");
  const u = new URL(req.url);
  if (u.searchParams.get("selftest")) {
    const phone = u.searchParams.get("phone") || "";
    const result = await ingestInboundWhatsapp({
      typeWebhook: "incomingMessageReceived",
      idMessage: `SELFTEST_${u.searchParams.get("id") || "1"}`,
      senderData: { chatId: `${phone.replace(/\D/g, "")}@c.us`, senderName: "Self Test" },
      messageData: { typeMessage: "textMessage", textMessageData: { textMessage: "בדיקת קליטה נכנסת (self-test)" } },
    });
    return NextResponse.json({ selftest: result });
  }
  const { id, token } = creds();
  const res = await fetch(`${base()}/waInstance${id}/getSettings/${token}`);
  const j = await res.json().catch(() => ({}));
  const envTok = process.env.GREENAPI_WEBHOOK_TOKEN || "";
  return NextResponse.json({
    webhookUrl: j?.webhookUrl ?? null,
    incomingWebhook: j?.incomingWebhook ?? null,
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
