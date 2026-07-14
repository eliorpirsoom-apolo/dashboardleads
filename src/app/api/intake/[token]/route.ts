import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  createLeadNumbered,
  defaultStatusId,
  findDuplicateLead,
  normalizeEmail,
  normalizePhone,
} from "@/lib/leads";
import { onLeadCreated } from "@/lib/hooks";
import { rateLimit } from "@/lib/rateLimit";

export const dynamic = "force-dynamic";

// ---------------------------------------------------------------------------
// PUBLIC intake endpoint — one URL per source token:
//   POST /api/intake/src_xxxxx   with a JSON body.
//
// Field mapping is deliberately forgiving: Make/Zapier, Elementor webhooks
// and Paycall all send different key names — aliases below cover them, and
// any unrecognized keys are preserved into the lead's custom data blob.
// ---------------------------------------------------------------------------

const ALIASES: Record<string, string[]> = {
  fullName: ["fullname", "full_name", "name", "שם", "שם מלא", "first_name", "your-name", "field_name"],
  phone: ["phone", "טלפון", "phone_number", "tel", "mobile", "your-phone", "caller", "caller_number", "from"],
  email: ["email", "מייל", "אימייל", "your-email", "e-mail", "mail"],
  city: ["city", "עיר", "location"],
  campaignLabel: ["campaign", "campaign_name", "קמפיין", "utm_campaign"],
  audience: ["audience", "adset", "adset_name", "קהל", "utm_medium"],
  adName: ["ad", "ad_name", "מודעה", "creative", "utm_content"],
  channel: ["channel", "ערוץ", "utm_source", "source"],
  platform: ["platform", "פלטפורמה"],
  consent: ["consent", "הסכמה", "marketing_consent", "newsletter", "accept_marketing"],
  callDurationSec: ["duration", "call_duration", "משך שיחה", "duration_seconds"],
  callRecordingUrl: ["recording", "recording_url", "הקלטה", "call_recording"],
  callStatus: ["call_status", "סטטוס שיחה", "disposition"],
  externalId: ["id", "lead_id", "external_id", "call_id", "entry_id"],
};

function pick(payload: Record<string, any>, target: string): any {
  const keys = Object.keys(payload);
  // exact key first
  if (payload[target] !== undefined) return payload[target];
  for (const alias of ALIASES[target] ?? []) {
    const hit = keys.find((k) => k.toLowerCase().trim() === alias);
    if (hit !== undefined) return payload[hit];
  }
  return undefined;
}

function asBool(v: any): boolean {
  if (typeof v === "boolean") return v;
  const s = String(v ?? "").toLowerCase();
  return ["true", "1", "yes", "on", "כן"].includes(s);
}

// GET — connection test for Make/Zapier setup wizards.
export async function GET(
  _req: Request,
  { params }: { params: { token: string } }
) {
  const source = await prisma.leadSource.findUnique({
    where: { token: params.token },
    select: { name: true, active: true },
  });
  if (!source || !source.active) {
    return NextResponse.json({ error: "מקור לא מוכר" }, { status: 404 });
  }
  return NextResponse.json({
    ok: true,
    source: source.name,
    hint: "שלחו POST עם JSON של פרטי הליד לכתובת הזו",
  });
}

export async function POST(
  req: Request,
  { params }: { params: { token: string } }
) {
  // Rate limit per token: 60 hits/minute.
  if (!rateLimit(`intake:${params.token}`, 60, 60_000)) {
    return NextResponse.json({ error: "יותר מדי בקשות" }, { status: 429 });
  }

  const source = await prisma.leadSource.findUnique({
    where: { token: params.token },
  });
  if (!source || !source.active) {
    return NextResponse.json({ error: "מקור לא מוכר" }, { status: 404 });
  }

  let payload: Record<string, any>;
  try {
    const text = await req.text();
    // Some form plugins send urlencoded — support both.
    if (text.trim().startsWith("{") || text.trim().startsWith("[")) {
      payload = JSON.parse(text);
    } else {
      payload = Object.fromEntries(new URLSearchParams(text));
    }
    if (Array.isArray(payload)) payload = payload[0] ?? {};
  } catch {
    await prisma.intakeLog.create({
      data: {
        sourceId: source.id,
        clientId: source.clientId,
        status: "error",
        error: "גוף בקשה לא קריא",
      },
    });
    return NextResponse.json({ error: "גוף בקשה לא תקין" }, { status: 400 });
  }

  const rawPayload = JSON.stringify(payload).slice(0, 4000);

  try {
    const phone = normalizePhone(pick(payload, "phone"));
    const email = normalizeEmail(pick(payload, "email"));
    const fullName = pick(payload, "fullName");

    if (!phone && !email && !fullName) {
      await prisma.intakeLog.create({
        data: {
          sourceId: source.id,
          clientId: source.clientId,
          status: "rejected",
          error: "ללא שם, טלפון או אימייל — לא נוצר ליד",
          payload: rawPayload,
        },
      });
      return NextResponse.json(
        { error: "חסרים פרטי ליד (שם/טלפון/אימייל)" },
        { status: 422 }
      );
    }

    // Dedupe within 24h by phone/email.
    const dup = await findDuplicateLead(source.clientId, phone, email);
    if (dup) {
      await prisma.intakeLog.create({
        data: {
          sourceId: source.id,
          clientId: source.clientId,
          status: "duplicate",
          leadId: dup.id,
          payload: rawPayload,
        },
      });
      await prisma.leadSource.update({
        where: { id: source.id },
        data: { lastSeenAt: new Date() },
      });
      return NextResponse.json({ ok: true, duplicate: true, leadId: dup.id });
    }

    // Unmapped keys → custom data blob.
    const mappedAliases = new Set(
      Object.values(ALIASES).flat().concat(Object.keys(ALIASES))
    );
    const extra: Record<string, any> = {};
    for (const [k, v] of Object.entries(payload)) {
      if (!mappedAliases.has(k.toLowerCase().trim()) && v !== null && v !== "") {
        extra[k] = v;
      }
    }

    const duration = pick(payload, "callDurationSec");
    const lead = await createLeadNumbered({
      clientId: source.clientId,
      sourceId: source.id,
      kind: source.kind,
      statusId: await defaultStatusId(source.clientId),
      externalId: pick(payload, "externalId")
        ? String(pick(payload, "externalId"))
        : null,
      fullName: fullName ? String(fullName).slice(0, 120) : null,
      phone,
      email,
      city: pick(payload, "city") ? String(pick(payload, "city")).slice(0, 80) : null,
      channel: pick(payload, "channel")
        ? String(pick(payload, "channel")).slice(0, 40)
        : source.channel,
      platform: pick(payload, "platform")
        ? String(pick(payload, "platform")).slice(0, 40)
        : source.platform,
      campaignLabel: pick(payload, "campaignLabel")
        ? String(pick(payload, "campaignLabel")).slice(0, 160)
        : null,
      audience: pick(payload, "audience")
        ? String(pick(payload, "audience")).slice(0, 160)
        : null,
      adName: pick(payload, "adName")
        ? String(pick(payload, "adName")).slice(0, 160)
        : null,
      consent: asBool(pick(payload, "consent")),
      callDurationSec: duration ? Number(duration) || null : null,
      callRecordingUrl: pick(payload, "callRecordingUrl")
        ? String(pick(payload, "callRecordingUrl"))
        : null,
      callStatus: pick(payload, "callStatus")
        ? String(pick(payload, "callStatus")).slice(0, 60)
        : null,
      receivedAt: new Date(),
      data: Object.keys(extra).length ? JSON.stringify(extra) : null,
    });

    await prisma.$transaction([
      prisma.intakeLog.create({
        data: {
          sourceId: source.id,
          clientId: source.clientId,
          status: "ok",
          leadId: lead.id,
          payload: rawPayload,
        },
      }),
      prisma.leadSource.update({
        where: { id: source.id },
        data: { lastSeenAt: new Date() },
      }),
    ]);

    await onLeadCreated(lead.id);

    return NextResponse.json({ ok: true, leadId: lead.id, number: lead.number });
  } catch (err) {
    console.error("[intake]", err);
    await prisma.intakeLog.create({
      data: {
        sourceId: source.id,
        clientId: source.clientId,
        status: "error",
        error: String((err as Error)?.message ?? err).slice(0, 500),
        payload: rawPayload,
      },
    });
    return NextResponse.json({ error: "שגיאה בקליטת הליד" }, { status: 500 });
  }
}
