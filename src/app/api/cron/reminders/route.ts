import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendMessage, type Channel } from "@/lib/messaging";
import { formatDateTime } from "@/lib/format";
import { maybeSendMorningDigest } from "@/lib/digest";
import { sendDueMaterialReminders } from "@/lib/materials";
import { maybeAutoSyncSumit } from "@/lib/integrations/sumitSync";
import {
  processPendingCallTranscriptions,
  downloadPendingRecordings,
} from "@/lib/transcription";
import { sendDueBirthdayGreetings } from "@/lib/birthday";

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
          lead: { select: { fullName: true, phone: true, number: true } },
        },
      },
    },
  });

  let sent = 0;
  let failed = 0;

  for (const reminder of due) {
    const { task } = reminder;
    const channel = reminder.channel as Channel;

    // Resolve recipients: assignee → client users → admins.
    let recipients: { to: string }[] = [];
    if (task.assignee) {
      const to =
        channel === "email" ? task.assignee.email : task.assignee.phone ?? "";
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

    const typeLabel = task.type === "meeting" ? "פגישה" : "משימה";
    const leadLine = task.lead
      ? `\nליד: ${task.lead.fullName ?? ""} (#${task.lead.number}) ${task.lead.phone ?? ""}`
      : "";
    const body =
      `תזכורת: ${typeLabel} — ${task.title}\n` +
      `מועד: ${formatDateTime(task.dueAt)}` +
      (task.location ? `\nמיקום: ${task.location}` : "") +
      leadLine +
      (task.description ? `\n\n${task.description}` : "");

    let ok = false;
    for (const r of recipients) {
      const res = await sendMessage({
        channel,
        to: r.to,
        subject: `תזכורת: ${task.title}`,
        body,
        kind: "reminder",
        clientId: task.clientId,
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

  // 📄 סנכרון SUMIT אוטומטי — פעם בשעה (חד-כיווני: מסמכים מ-SUMIT → דשבורד).
  // רץ אחרון כדי שלא יחסום את שאר המשימות. ?sumit=force לבדיקה מיידית.
  let sumitSync: unknown = null;
  try {
    sumitSync = await maybeAutoSyncSumit(
      new URL(req.url).searchParams.get("sumit") === "force"
    );
  } catch (err) {
    console.error("[sumit-sync]", err);
  }

  // 🎙️ הקלטות: קודם שומרים כל הקלטה חדשה ל-R2 (ללא תלות במפתח תמלול),
  // ואז — אם מוגדר OpenAI — מתמללים ומסכמים.
  let recordings: unknown = null;
  try {
    recordings = await downloadPendingRecordings();
  } catch (err) {
    console.error("[recording-download]", err);
  }
  let transcriptions: unknown = null;
  try {
    transcriptions = await processPendingCallTranscriptions();
  } catch (err) {
    console.error("[transcription]", err);
  }

  return NextResponse.json({
    processed: due.length,
    sent,
    failed,
    digest,
    materialReminders,
    birthdays,
    sumitSync,
    recordings,
    transcriptions,
  });
}
