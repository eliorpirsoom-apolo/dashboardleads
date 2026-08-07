import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { handle, requireAdmin, readJson, ApiError } from "@/lib/api";
import { requireManager } from "@/lib/permissions";
import { audit } from "@/lib/audit";
import { emailConfigured, smsConfigured, whatsappConfigured } from "@/lib/messaging";
import { googleEnabled } from "@/lib/google";
import { r2Configured } from "@/lib/storage";

export const dynamic = "force-dynamic";

// GET /api/integrations?clientId — connection status board (admin).
// Global (env-based): email/sms/whatsapp/google/r2.
// Per-client (Integration rows): meta, paycall, search_console, ga4.
export const GET = handle(async (req) => {
  await requireAdmin();
  const clientId = new URL(req.url).searchParams.get("clientId");

  const globals = {
    email: emailConfigured(),
    sms: smsConfigured(),
    whatsapp: whatsappConfigured(),
    google_login: googleEnabled(),
    storage_r2: r2Configured(),
    receipts_token: Boolean(process.env.RECEIPTS_UPLOAD_TOKEN),
  };

  const clientIntegrations = clientId
    ? await prisma.integration.findMany({
        where: { clientId },
        select: {
          id: true, kind: true, status: true,
          lastSyncAt: true, lastError: true, updatedAt: true,
        },
      })
    : [];

  return NextResponse.json({ globals, clientIntegrations });
});

const SaveIntegration = z.object({
  clientId: z.string().min(1),
  kind: z.enum(["meta", "paycall", "search_console", "ga4", "whatsapp"]),
  config: z.record(z.string()).optional(),
  accessToken: z.string().optional(),
  refreshToken: z.string().optional(),
});

// POST /api/integrations — save/connect a per-client integration. Manager only.
export const POST = handle(async (req) => {
  const actor = await requireManager();
  const body = SaveIntegration.parse(await readJson(req));

  const client = await prisma.client.findUnique({ where: { id: body.clientId } });
  if (!client) throw new ApiError(404, "לקוח לא נמצא");

  // מופע וואטסאפ ייעודי ללקוח (Green API): מאמתים את הפרטים מול Green API
  // ומכוונים את ה-webhook הנכנס אל המערכת — כדי שתשובות הלידים ייקלטו.
  if (body.kind === "whatsapp") {
    const idInstance = (body.config?.idInstance || "").trim();
    const apiToken = (body.config?.apiToken || "").trim();
    if (!idInstance || !apiToken) throw new ApiError(400, "חסרים idInstance או apiToken");
    const base = (process.env.GREENAPI_API_URL || "https://api.green-api.com").replace(/\/$/, "");
    const check = await fetch(`${base}/waInstance${idInstance}/getSettings/${apiToken}`);
    if (!check.ok) {
      throw new ApiError(400, `פרטי החיבור לא תקינים (Green API ${check.status}) — בדקו idInstance/apiToken`);
    }
    const secret = process.env.GREENAPI_WEBHOOK_TOKEN;
    if (secret) {
      const appUrl = process.env.APP_BASE_URL || "https://dashboard-leads-apollo13.vercel.app";
      await fetch(`${base}/waInstance${idInstance}/setSettings/${apiToken}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          webhookUrl: `${appUrl}/api/webhooks/greenapi`,
          webhookUrlToken: secret,
          incomingWebhook: "yes",
          stateWebhook: "no",
          outgoingWebhook: "no",
          outgoingAPIMessageWebhook: "no",
          outgoingMessageWebhook: "no",
          pollMessageWebhook: "no",
        }),
      }).catch(() => {});
    }
  }

  const integration = await prisma.integration.upsert({
    where: { clientId_kind: { clientId: body.clientId, kind: body.kind } },
    create: {
      clientId: body.clientId,
      kind: body.kind,
      status: "connected",
      config: body.config ? JSON.stringify(body.config) : null,
      accessToken: body.accessToken ?? null,
      refreshToken: body.refreshToken ?? null,
    },
    update: {
      status: "connected",
      config: body.config ? JSON.stringify(body.config) : undefined,
      accessToken: body.accessToken,
      refreshToken: body.refreshToken,
      lastError: null,
    },
  });
  await audit(actor, "integration_connected", "integration", integration.id, `${body.kind} (לקוח ${body.clientId})`);
  return NextResponse.json({
    integration: { id: integration.id, kind: integration.kind, status: integration.status },
  });
});
