import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendMessage, type Channel } from "@/lib/messaging";
import { formatDateTime } from "@/lib/format";
import { maybeSendMorningDigest } from "@/lib/digest";
import { sendDueMaterialReminders } from "@/lib/materials";
import { maybeAutoSyncSumit } from "@/lib/integrations/sumitSync";
import { sendDueBirthdayGreetings } from "@/lib/birthday";
import { sendDueDesignApprovalReminders, markOverdueDesignTasks } from "@/lib/studioReminders";
import { sweepStudioCalendar } from "@/lib/studioGcal";
import { runWhatsappBroadcast } from "@/lib/whatsappBroadcast";
import { runLeadSlaChecks } from "@/lib/leadSla";
import { processBillingAlerts } from "@/lib/billingAlerts";
import { touchCronHeartbeat, watchdogHealthCron } from "@/lib/health";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// ---------------------------------------------------------------------------
// Reminder engine — runs every 5 minutes via Vercel Cron (vercel.json).
// Finds due pending reminders on open tasks and dispatches them through the
// messaging layer to the assignee (fallback: the client's users / admins).
// ---------------------------------------------------------------------------

function authorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return process.env.NODE_ENV !== "production";
  const header = req.headers.get("authorization");
  return header === `Bearer ${secret}`;
}

export async function GET(req: Request) {
  if (!authorized(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  await touchCronHeartbeat("reminders");
  // שומר לשומר: אם קרון הבריאות עצמו לא רץ 26 שעות — התראה מכאן.
  await watchdogHealthCron();

  // מטאטא הודעות: שורה שנשארה pending מעל שעה = השליחה קרסה באמצע (טיימאאוט
  // וכד') — מסומנת failed כדי שיומן ההודעות ישקף אמת ולא יצבור "תקועות".
  await prisma.message
    .updateMany({
      where: { status: "pending", createdAt: { lt: new Date(Date.now() - 60 * 60_000) } },
      data: { status: "failed", error: "השליחה נקטעה באמצע (טיימאאוט) — סומן אוטומטית ככשל" },
    })
    .catch(() => {});

  const due = await prisma.reminder.findMany({
    where: {
      status: "pending",
      remindAt: { lte: new Date() },
      task: { status: "open" },
    },
    take: 50,
    include: {
      task: {
        include: {
          assignee: true,
          client: true,
          lead: { select: { fullName: true, phone: true, email: true, number: true } },
        },
      },
    },
  });

  let sent = 0;
  let failed = 0;

  for (const reminder of due) {
    const { task } = reminder;
    const channel = reminder.channel as Channel;

    // 👥 תזכורת זימון-צוות — הודעה אחת לקבוצת הוואטסאפ של המשרד.
    if (reminder.target === "office_group") {
      const { getTaskAgentConfig } = await import("@/lib/taskAgent");
      const { sendWhatsappToChat } = await import("@/lib/whatsapp");
      const cfg = await getTaskAgentConfig();
      let groupOk = false;
      if (cfg.officeGroupChatId) {
        const r = await sendWhatsappToChat(
          cfg.officeGroupChatId,
          `⏰ תזכורת לכל הצוות: ${task.type === "meeting" ? "פגישה" : "משימה"} — ${task.title}\n` +
            `מועד: ${formatDateTime(task.dueAt)}` +
            (task.location ? `\nמיקום: ${task.location}` : "")
        );
        groupOk = r.ok;
      }
      await prisma.reminder.update({
        where: { id: reminder.id },
        data: {
          status: groupOk ? "sent" : "failed",
          sentAt: new Date(),
          error: cfg.officeGroupChatId
            ? groupOk
              ? null
              : "שליחה לקבוצת המשרד נכשלה"
            : "לא הוגדרה קבוצת משרד (הגדרות ⟵ סוכן המשימות)",
        },
      });
      groupOk ? sent++ : failed++;
      continue;
    }

    const toLead = reminder.target === "lead";
    const typeLabel =
      task.type === "meeting" ? "פגישה" : task.type === "contract" ? "חתימת חוזה" : "משימה";

    // נמענים: יעד "lead" → הלקוח הסופי (לפי הליד). אחרת: הסוכן → משתמשי הלקוח → מנהלים.
    let recipients: { to: string }[] = [];
    if (toLead) {
      const to = channel === "email" ? task.lead?.email ?? "" : task.lead?.phone ?? "";
      if (to) recipients = [{ to }];
    } else {
      if (task.assignee) {
        const to = channel === "email" ? task.assignee.email : task.assignee.phone ?? "";
        if (to) recipients = [{ to }];
      }
      if (recipients.length === 0) {
        const users = await prisma.user.findMany({
          where: task.clientId
            ? { clientId: task.clientId, active: true }
            : { role: "ADMIN", active: true },
        });
        recipients = users
          .map((u) => ({ to: channel === "email" ? u.email : u.phone ?? "" }))
          .filter((r) => r.to);
      }
    }

    // הודעה מותאמת: פנייה ישירה ללקוח, או תזכורת פנימית לסוכן.
    const orgName = task.client?.name ?? "אפולו פרסום";
    const body = toLead
      ? `שלום${task.lead?.fullName ? ` ${task.lead.fullName}` : ""},\n` +
        `תזכורת ל${typeLabel} שנקבעה ל-${formatDateTime(task.dueAt)}.` +
        (task.location ? `\nמיקום: ${task.location}` : "") +
        `\n\nנתראה,\n${orgName}`
      : `תזכורת: ${typeLabel} — ${task.title}\n` +
        `מועד: ${formatDateTime(task.dueAt)}` +
        (task.location ? `\nמיקום: ${task.location}` : "") +
        (task.lead
          ? `\nליד: ${task.lead.fullName ?? ""} (#${task.lead.number}) ${task.lead.phone ?? ""}`
          : "") +
        (task.description ? `\n\n${task.description}` : "");

    let ok = false;
    for (const r of recipients) {
      const res = await sendMessage({
        channel,
        to: r.to,
        subject: toLead ? `תזכורת ל${typeLabel}` : `תזכורת: ${task.title}`,
        body,
        kind: "reminder",
        clientId: task.clientId,
        // תזכורת וואטסאפ ללקוח הסופי — אך ורק מהמופע של הלקוח (בלי fallback).
        viaClientWa: toLead && channel === "whatsapp",
      });
      if (res.status === "sent" || res.status === "skipped") ok = true;
    }

    await prisma.reminder.update({
      where: { id: reminder.id },
      data: {
        status: ok || recipients.length === 0 ? "sent" : "failed",
        sentAt: new Date(),
        error:
          recipients.length === 0
            ? "לא נמצא נמען (אין משתמש משויך עם פרטי קשר)"
            : null,
      },
    });
    ok ? sent++ : failed++;
  }

  // ☕ תקציר בוקר — רוכב על אותו cron; נשלח פעם ביום ב-08:00.
  // ?digest=force — שליחה מיידית לבדיקה (עדיין מאחורי ה-CRON_SECRET).
  let digest = false;
  try {
    digest = await maybeSendMorningDigest(
      new URL(req.url).searchParams.get("digest") === "force"
    );
  } catch (err) {
    console.error("[digest]", err);
  }

  // תזכורות "מכולת" — חומרים שטרם התקבלו.
  let materialReminders = 0;
  try {
    materialReminders = await sendDueMaterialReminders();
  } catch (err) {
    console.error("[materials]", err);
  }

  // 🎂 ברכות יום הולדת ללקוחות — פעם ביום ב-09:00 (שעון ישראל). ?birthday=force לבדיקה.
  let birthdays = 0;
  try {
    birthdays = await sendDueBirthdayGreetings(
      new URL(req.url).searchParams.get("birthday") === "force"
    );
  } catch (err) {
    console.error("[birthday]", err);
  }

  // 🎙️ הקלטות ותמלול עברו לקרון עצמאי (/api/cron/transcribe, כל 5 דק') —
  // תקציב זמן ייעודי וקיבולת גדולה יותר לבקרים עמוסי-שיחות.

  // 📄 סנכרון SUMIT עבר לקרון עצמאי (/api/cron/sumit, כל 15 דק') — כדי שלא
  // יתחרה על תקציב הזמן עם ההקלטות/תמלולים. ?sumit=force עדיין עובד לבדיקה.
  let sumitSync: unknown = null;
  if (new URL(req.url).searchParams.get("sumit") === "force") {
    try {
      sumitSync = await maybeAutoSyncSumit(true);
    } catch (err) {
      console.error("[sumit-sync]", err);
    }
  }

  // 🎨 סטודיו: תזכורות אישור ללקוח (כל יומיים×3) + סימון משימות באיחור
  // + ריפוי-עצמי של סנכרון היומן ("תוזמן בלוז" — שאף משימה לא תברח).
  let studio: unknown = null;
  try {
    const [approvalReminders, overdue, gcal] = await Promise.all([
      sendDueDesignApprovalReminders(),
      markOverdueDesignTasks(),
      sweepStudioCalendar(),
    ]);
    studio = { approvalReminders, overdue, gcal };
  } catch (err) {
    console.error("[studio]", err);
  }

  // ⏰ Speed-to-Lead: תזכורות אי-טיפול בלידים + הסלמה למנהלים.
  let leadSla: unknown = null;
  try {
    leadSla = await runLeadSlaChecks();
  } catch (err) {
    console.error("[lead-sla]", err);
  }

  // ☀️ תקציר בוקר למשווקים (צד לקוח) — 08:30-09:30, פעם ביום, רק כשיש עבודה.
  let agentDigests = 0;
  try {
    const { sendAgentMorningDigests } = await import("@/lib/agentDigest");
    agentDigests = await sendAgentMorningDigests(
      new URL(req.url).searchParams.get("agentDigest") === "force"
    );
  } catch (err) {
    console.error("[agent-digest]", err);
  }

  // 💰 התראות הנהלת חשבונות — אי-תשלום חודשי + תזכורות ידניות.
  let billing: unknown = null;
  try {
    billing = await processBillingAlerts();
  } catch (err) {
    console.error("[billing-alerts]", err);
  }

  // 📣 בוט קבוצות וואטסאפ — הודעת בוקר/סוף-יום לקבוצות (כבוי כברירת מחדל).
  // מתוזמן לפי שעון ישראל עם dedup יומי; ?broadcast=force לשליחה מיידית לבדיקה.
  let broadcast: unknown = null;
  try {
    broadcast = await runWhatsappBroadcast(
      new URL(req.url).searchParams.get("broadcast") === "force"
    );
  } catch (err) {
    console.error("[wa-broadcast]", err);
  }

  return NextResponse.json({
    processed: due.length,
    sent,
    failed,
    digest,
    materialReminders,
    birthdays,
    sumitSync,
    studio,
    leadSla,
    agentDigests,
    billing,
    broadcast,
  });
}
