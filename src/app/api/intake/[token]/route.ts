import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  createLeadNumbered,
  defaultStatusId,
  findDuplicateLead,
  normalizeEmail,
  normalizePhone,
} from "@/lib/leads";
import { onLeadCreated, notifyRepeatInquiry } from "@/lib/hooks";
import { rateLimit } from "@/lib/rateLimit";
import { recordActivity, pickAutoAssignee } from "@/lib/leadActivity";
import { sendMessage } from "@/lib/messaging";

// התראה למשרד כשמקור צובר כשלונות רצופים (5+), לכל היותר פעם ב-24 שעות.
async function alertOnRepeatedFailures(sourceId: string, sourceName: string) {
  try {
    const recent = await prisma.intakeLog.findMany({
      where: { sourceId },
      orderBy: { createdAt: "desc" },
      take: 5,
      select: { status: true },
    });
    const allFailing =
      recent.length === 5 &&
      recent.every((l) => l.status === "error" || l.status === "rejected");
    if (!allFailing) return;

    const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const alreadyAlerted = await prisma.message.findFirst({
      where: {
        kind: "system",
        subject: { contains: `מקור קליטה תקול: ${sourceName}` },
        createdAt: { gte: dayAgo },
      },
    });
    if (alreadyAlerted) return;

    const admins = await prisma.user.findMany({
      where: { role: "ADMIN", active: true },
    });
    for (const admin of admins) {
      await sendMessage({
        channel: "email",
        to: admin.email,
        subject: `⚠️ מקור קליטה תקול: ${sourceName}`,
        body:
          `5 הקליטות האחרונות במקור "${sourceName}" נכשלו.\n` +
          `בדקו את מיפוי השדות ב-Make/Zapier או בטופס.\n` +
          `פירוט מלא: יומן הקליטה בהגדרות הלקוח.`,
        kind: "system",
      });
    }
  } catch (err) {
    console.error("[intake alert]", err);
  }
}

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
  fullName: ["fullname", "full_name", "full-name", "name", "שם", "שם מלא", "שם פרטי", "שם ומשפחה", "first_name", "your-name", "field_name"],
  phone: ["phone", "טלפון", "טלפון נייד", "נייד", "מספר טלפון", "מס' טלפון", "phone_number", "phone-number", "phone number", "tel", "mobile", "your-phone", "caller", "caller_number", "caller_id", "callerid", "cli", "ani", "src", "source_number", "מספר מתקשר", "ממספר", "from"],
  email: ["email", "מייל", "אימייל", "כתובת מייל", "דוא\"ל", "email address", "your-email", "e-mail", "mail"],
  city: ["city", "עיר", "location"],
  campaignLabel: ["campaign", "campaign_name", "קמפיין", "utm_campaign", "שם קבוצה", "group", "group_name"],
  audience: ["audience", "adset", "adset_name", "קהל", "utm_medium"],
  adName: ["ad", "ad_name", "מודעה", "creative", "utm_content"],
  channel: ["channel", "ערוץ", "utm_source", "source"],
  platform: ["platform", "פלטפורמה"],
  consent: ["consent", "הסכמה", "marketing_consent", "newsletter", "accept_marketing"],
  callDurationSec: ["duration", "call_duration", "משך שיחה", "duration_seconds", "seconds", "שניות", "סה\"כ שניות", "talk_time", "talktime", "airtime", "זמן אוויר", "billsec"],
  callRecordingUrl: ["dlinkdirect", "recording", "recording_url", "recording_link", "הקלטה", "call_recording", "record", "record_url", "audio", "audio_url", "url_recording", "dlink", "link"],
  callStatus: ["call_status", "סטטוס שיחה", "disposition", "status", "מענה", "ענה", "answered", "call_result", "result", "סטטוס", "וזמן מענה"],
  callAdNumber: ["did", "ddi", "dialed", "dialed_number", "checkcall", "check_call", "checkcall_number", "מספר checkcall", "מספר פרסומי", "campaign_number", "virtual_number", "dnis", "publish_number", "מספר קו", "line_number"],
  callTargetNumber: ["target", "target_number", "מספר יעד", "מספר טלפון ביעד", "agent_number", "forward_to", "answered_by", "extension", "destination", "dest", "callee", "to"],
  callTargetName: ["target_name", "שם יעד", "agent", "agent_name", "שם נציג", "שם היעד", "custname", "cust_name", "customer_name"],
  callTranscript: ["transcript", "תמלול", "תמלול שיחה", "call_transcript", "text"],
  callSummary: ["summary", "סיכום", "סיכום שיחה", "call_summary", "abstract"],
  externalId: ["id", "lead_id", "external_id", "call_id", "callid", "checkcall_id", "unique_id", "uniqueid", "uid", "recordid", "entry_id"],
};

// "fields[email][value]=x" → { fields: { email: { value: "x" } } }.
// Elementor's "Advanced Data" webhook sends urlencoded bodies with bracket
// keys; plain "name=x" pairs pass through flat.
function expandBracketKeys(params: URLSearchParams): Record<string, any> {
  const root: Record<string, any> = {};
  for (const [rawKey, value] of params.entries()) {
    const path = rawKey.includes("[")
      ? rawKey.replace(/\]/g, "").split("[").filter(Boolean)
      : [rawKey];
    let node = root;
    for (let i = 0; i < path.length - 1; i++) {
      if (typeof node[path[i]] !== "object" || node[path[i]] === null) {
        node[path[i]] = {};
      }
      node = node[path[i]];
    }
    node[path[path.length - 1]] = value;
  }
  return root;
}

// Elementor webhooks arrive in two shapes — flatten both to key→value so the
// alias mapping can work:
//   basic:    form_fields[<field id>] = value
//   advanced: fields[<field id>] = { title, value, raw_value } + form/meta
// The field label (title) is added as a key too, so Hebrew labels like
// "טלפון" match the aliases even when the field id is a random field_xxxxx.
function flattenFormShapes(payload: Record<string, any>): Record<string, any> {
  if (
    payload.form_fields &&
    typeof payload.form_fields === "object" &&
    !Array.isArray(payload.form_fields)
  ) {
    const { form_fields, ...rest } = payload;
    return { ...rest, ...form_fields };
  }
  if (
    payload.fields &&
    typeof payload.fields === "object" &&
    !Array.isArray(payload.fields)
  ) {
    const out: Record<string, any> = {};
    for (const [id, f] of Object.entries<any>(payload.fields)) {
      if (f && typeof f === "object") {
        const v = f.value ?? f.raw_value;
        if (v !== undefined) {
          out[id] = v;
          const title = typeof f.title === "string" ? f.title.trim() : "";
          if (title) out[title] = v;
        }
      } else if (f !== undefined) {
        out[id] = f;
      }
    }
    const pageUrl = payload.meta?.page_url;
    if (pageUrl) {
      out.page_url = typeof pageUrl === "object" ? pageUrl.value : pageUrl;
    }
    return out;
  }
  return payload;
}

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

// סטטוס מענה של CheckCall/פייקול → עברית (עם נפילה חזרה לערך הגולמי).
function normalizeCallStatus(v: any): string {
  const s = String(v ?? "").toUpperCase().trim().replace(/[\s-]+/g, "_");
  const map: Record<string, string> = {
    ANSWER: "נענתה",
    ANSWERED: "נענתה",
    NO_ANSWER: "לא נענתה",
    NOANSWER: "לא נענתה",
    MISSED: "לא נענתה",
    BUSY: "תפוס",
    CANCEL: "בוטלה",
    CANCELLED: "בוטלה",
    FAILED: "נכשלה",
    REJECTED: "נדחתה",
    VOICEMAIL: "תא קולי",
  };
  return map[s] ?? String(v);
}

// GET — בדיקת חיבור ל-Make/Zapier; אך אם יש פרמטרים ב-query string (ספקים
// כמו פייקול ששולחים שיחה ב-GET), מפנים אותם לעיבוד הרגיל של POST כדי שהשיחה
// תיקלט ותירשם ביומן במקום להתעלם ממנה.
export async function GET(
  req: Request,
  ctx: { params: { token: string } }
) {
  const url = new URL(req.url);
  const sp = url.searchParams;
  if ([...sp.keys()].length > 0) {
    const proxied = new Request(url.origin + url.pathname, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: sp.toString(),
    });
    return POST(proxied, ctx);
  }
  const source = await prisma.leadSource.findUnique({
    where: { token: ctx.params.token },
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
    include: {
      client: { select: { autoAssignLeads: true } },
      project: {
        select: {
          id: true,
          assignments: { select: { userId: true, isPrimary: true } },
        },
      },
    },
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
      payload = expandBracketKeys(new URLSearchParams(text));
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
  payload = flattenFormShapes(payload);

  try {
    // --- נתוני שיחה (CheckCall/פייקול) — מחושבים פעם אחת, לעדכון וליצירה ---
    const transcript = pick(payload, "callTranscript");
    const summary = pick(payload, "callSummary");
    const extId = pick(payload, "externalId");
    const recRaw = pick(payload, "callRecordingUrl");
    const recUrl =
      recRaw && /^https?:\/\//i.test(String(recRaw)) ? String(recRaw).slice(0, 500) : null;
    const durationRaw = pick(payload, "callDurationSec");
    const durationNum = durationRaw ? Number(durationRaw) || null : null;
    const statusRaw = pick(payload, "callStatus");
    const statusVal = statusRaw ? normalizeCallStatus(statusRaw) : null;
    const adNum = pick(payload, "callAdNumber")
      ? String(pick(payload, "callAdNumber")).trim().slice(0, 40)
      : null;
    const targetNum = pick(payload, "callTargetNumber")
      ? String(pick(payload, "callTargetNumber")).trim().slice(0, 40)
      : null;
    const targetName = pick(payload, "callTargetName")
      ? String(pick(payload, "callTargetName")).trim().slice(0, 120)
      : null;

    // כל webhook נוסף על אותה שיחה (START→END, או התמלול/סיכום שמגיע אח"כ) —
    // מזוהה לפי externalId (מזהה השיחה) ומעדכן את הליד הקיים במקום ליצור כפילות.
    if (extId) {
      const existing = await prisma.lead.findFirst({
        where: { clientId: source.clientId, externalId: String(extId) },
        orderBy: { createdAt: "desc" },
      });
      if (existing) {
        const upd: Record<string, any> = {};
        if (recUrl) upd.callRecordingUrl = recUrl;
        if (durationNum != null) upd.callDurationSec = durationNum;
        if (statusVal) upd.callStatus = statusVal;
        if (adNum) upd.callAdNumber = adNum;
        if (targetNum) upd.callTargetNumber = targetNum;
        if (targetName) upd.callTargetName = targetName;
        if (transcript) upd.callTranscript = String(transcript).slice(0, 20000);
        if (summary) upd.callSummary = String(summary).slice(0, 8000);
        if (Object.keys(upd).length) {
          await prisma.lead.update({ where: { id: existing.id }, data: upd });
        }
        await prisma.intakeLog.create({
          data: {
            sourceId: source.id,
            clientId: source.clientId,
            status: "ok",
            leadId: existing.id,
            payload: rawPayload,
          },
        });
        await prisma.leadSource.update({
          where: { id: source.id },
          data: { lastSeenAt: new Date() },
        });
        return NextResponse.json({ ok: true, updated: true, leadId: existing.id });
      }
    }

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
      await alertOnRepeatedFailures(source.id, source.name);
      return NextResponse.json(
        { error: "חסרים פרטי ליד (שם/טלפון/אימייל)" },
        { status: 422 }
      );
    }

    // Dedupe within 24h by phone/email — לא לשיחות (כל שיחה נפרדת = ליד;
    // כפילות webhook לאותה שיחה כבר טופלה לפי externalId למעלה).
    const dup = source.kind === "call" ? null : await findDuplicateLead(source.clientId, phone, email);
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
      // פנייה חוזרת = ליד חם: נרשם בציר הפעילות של הליד הקיים + וואטסאפ למשווק.
      await recordActivity(dup.id, "מערכת", "repeat", {
        note: `הליד פנה שוב דרך ${source.name}`,
      });
      await notifyRepeatInquiry(dup.id, source.name).catch(() => {});
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

    // שיוך מטפל: מקור של פרויקט → הסוכן הראשי של הפרויקט (או סבב בין סוכני
    // הפרויקט אם הלקוח הפעיל שיוך אוטומטי). מקור בלי פרויקט → סבב כלל-לקוחי.
    let assigneeId: string | null = null;
    const projectAgents = source.project?.assignments ?? [];
    if (projectAgents.length > 0) {
      if (source.client.autoAssignLeads) {
        assigneeId = await pickAutoAssignee(
          source.clientId,
          projectAgents.map((a) => a.userId)
        );
      }
      // בלי סבב (או כשאין סוכן זמין) — הליד הולך לראשי של הפרויקט.
      assigneeId ??=
        projectAgents.find((a) => a.isPrimary)?.userId ??
        projectAgents[0].userId;
    } else if (source.client.autoAssignLeads) {
      assigneeId = await pickAutoAssignee(source.clientId);
    }
    const lead = await createLeadNumbered({
      clientId: source.clientId,
      projectId: source.projectId,
      sourceId: source.id,
      kind: source.kind,
      statusId: await defaultStatusId(source.clientId),
      assigneeId,
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
      callDurationSec: durationNum,
      callRecordingUrl: recUrl,
      callStatus: statusVal,
      callAdNumber: adNum,
      callTargetNumber: targetNum,
      callTargetName: targetName,
      callTranscript: transcript ? String(transcript).slice(0, 20000) : null,
      callSummary: summary ? String(summary).slice(0, 8000) : null,
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

    await recordActivity(lead.id, "מערכת", "create", { note: `קליטה: ${source.name}` });
    if (assigneeId) {
      const agent = await prisma.user.findUnique({ where: { id: assigneeId } });
      await recordActivity(lead.id, "מערכת", "assign", {
        toValue: agent?.name ?? "",
        note: "שיוך אוטומטי (סבב)",
      });
    }
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
    await alertOnRepeatedFailures(source.id, source.name);
    return NextResponse.json({ error: "שגיאה בקליטת הליד" }, { status: 500 });
  }
}
