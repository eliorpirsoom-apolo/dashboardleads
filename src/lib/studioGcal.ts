import { prisma } from "./prisma";
import { createTaskEvent, deleteTaskEvent, syncTaskEvent, taskEventExists } from "./gcal";
import { sendMessage } from "./messaging";
import { formatDateTime } from "./format";
import { briefTypeLabel } from "./studio";

// ---------------------------------------------------------------------------
// "תוזמן בלוז" — סנכרון משימות סטודיו ליומן ה-Google של המעצב/ת, עם אימות.
// מצבי gcalState:
//   none    — אין מעצב/ת או אין מועד (אין מה לתזמן)
//   pending — יש את שניהם, האירוע עוד לא נוצר/אומת; הקרון ינסה שוב
//   synced  — האירוע קיים ביומן (אומת מול Google)
//   blocked — לא ניתן לתזמן: המעצב/ת לא חיברה יומן Google
// הקרון (כל 5 דק') מרפא pending, מאמת synced מדגמית, ומתריע על blocked.
// ---------------------------------------------------------------------------

async function setGcal(
  taskId: string,
  state: string,
  error: string | null,
  checked = false
): Promise<void> {
  await prisma.designTask
    .update({
      where: { id: taskId },
      data: { gcalState: state, gcalError: error, ...(checked ? { gcalCheckedAt: new Date() } : {}) },
    })
    .catch(() => {});
}

/** תזמון/עדכון המשימה ביומן המעצב/ת + רישום מצב הסנכרון. אידמפוטנטי. */
export async function syncDesignTaskCalendar(
  designTaskId: string,
  actorId?: string | null
): Promise<string> {
  const task = await prisma.designTask.findUnique({ where: { id: designTaskId } });
  if (!task) return "none";

  // אין מעצב/ת או אין מועד — מנקים אירוע יתום אם נשאר, והמצב "none".
  if (!task.designerId || !task.scheduledAt) {
    if (task.calendarTaskId) {
      const calTask = await prisma.task.findUnique({ where: { id: task.calendarTaskId } });
      if (calTask) {
        await deleteTaskEvent(calTask).catch(() => {});
        await prisma.task.delete({ where: { id: calTask.id } }).catch(() => {});
      }
      await prisma.designTask
        .update({ where: { id: task.id }, data: { calendarTaskId: null } })
        .catch(() => {});
    }
    await setGcal(task.id, "none", null);
    return "none";
  }

  // משימה שאושרה — לא נוגעים יותר ביומן.
  if (task.status === "approved") return task.gcalState;

  // המעצב/ת חייבת חיבור יומן פעיל — אחרת אין לאן לכתוב.
  const conn = await prisma.calendarConnection.findUnique({
    where: { userId: task.designerId },
  });
  if (!conn?.active) {
    await setGcal(task.id, "blocked", "המעצב/ת לא חיברה יומן Google", true);
    return "blocked";
  }

  const title = `🎨 עיצוב — ${task.title}`;
  let calTaskId = task.calendarTaskId;

  if (calTaskId) {
    const existing = await prisma.task.findUnique({ where: { id: calTaskId } });
    if (!existing) {
      calTaskId = null; // ה-Task נמחק — ניצור מחדש למטה
    } else {
      const designerChanged =
        !!existing.googleEventOwnerId && existing.googleEventOwnerId !== task.designerId;
      await prisma.task
        .update({
          where: { id: calTaskId },
          data: { assigneeId: task.designerId, dueAt: task.scheduledAt, title },
        })
        .catch(() => {});
      if (designerChanged) {
        // הוחלף/ה מעצב/ת — האירוע עובר ליומן החדש.
        await deleteTaskEvent(existing).catch(() => {});
        await prisma.task
          .update({ where: { id: calTaskId }, data: { googleEventId: null, googleEventOwnerId: null } })
          .catch(() => {});
      }
      const fresh = await prisma.task.findUnique({ where: { id: calTaskId } });
      if (fresh?.googleEventId) {
        await syncTaskEvent(calTaskId).catch(() => {});
      } else if (fresh) {
        // האירוע מעולם לא נוצר (כשל קודם) — מנסים שוב.
        await createTaskEvent({ ...fresh, createdById: actorId ?? null }).catch(() => {});
      }
    }
  }

  if (!calTaskId) {
    const calTask = await prisma.task.create({
      data: {
        clientId: task.clientId,
        title,
        description: task.brief || null,
        type: "task",
        ownerSide: "agency",
        assigneeId: task.designerId,
        dueAt: task.scheduledAt,
        createdById: actorId ?? null,
      },
    });
    calTaskId = calTask.id;
    await prisma.designTask.update({
      where: { id: task.id },
      data: { calendarTaskId: calTaskId },
    });
    await createTaskEvent({ ...calTask, createdById: actorId ?? null }).catch(() => {});

    // התראה למעצב/ת — רק בשיבוץ הראשון.
    const designer = await prisma.user.findUnique({ where: { id: task.designerId } });
    if (designer?.email) {
      await sendMessage({
        channel: "email",
        to: designer.email,
        subject: "🎨 משימת עיצוב תוזמנה לך",
        body:
          `שובצה לך משימת עיצוב: ${task.title} (${briefTypeLabel(task.briefType)})\n` +
          `מועד: ${formatDateTime(task.scheduledAt)}` +
          (task.brief ? `\n\nבריף:\n${task.brief}` : ""),
        kind: "reminder",
        clientId: task.clientId,
      }).catch(() => {});
    }
  }

  // אימות: הצליחה יצירת האירוע? (createTaskEvent שומר googleEventId על ה-Task)
  const calTask = await prisma.task.findUnique({ where: { id: calTaskId } });
  if (calTask?.googleEventId) {
    await setGcal(task.id, "synced", null, true);
    return "synced";
  }
  await setGcal(task.id, "pending", "יצירת האירוע ביומן טרם הצליחה — ננסה שוב אוטומטית", true);
  return "pending";
}

const H = 60 * 60 * 1000;

/** סריקת ריפוי-עצמי (רץ מהקרון כל 5 דק'):
 *  pending/blocked → ניסיון חוזר; synced ותיק → אימות שהאירוע עדיין קיים ביומן
 *  (נמחק ע"י המעצב/ת? נוצר מחדש + התראה); מעברים ל-blocked → התראה למנהלים. */
export async function sweepStudioCalendar(): Promise<{
  checked: number;
  synced: number;
  recreated: number;
  blocked: number;
}> {
  const result = { checked: 0, synced: 0, recreated: 0, blocked: 0 };
  const tasks = await prisma.designTask.findMany({
    where: {
      status: { not: "approved" },
      designerId: { not: null },
      scheduledAt: { gte: new Date(Date.now() - 7 * 24 * H) },
    },
    orderBy: { scheduledAt: "asc" },
    take: 100,
    include: { designer: { select: { name: true } } },
  });
  result.checked = tasks.length;

  const newlyBlocked: { title: string; designer: string; error: string }[] = [];
  const recreatedTitles: { title: string; designer: string }[] = [];

  for (const t of tasks) {
    try {
      if (t.gcalState === "synced") {
        // אימות מדגמי כל 6 שעות: האם האירוע עדיין קיים ביומן?
        if (t.gcalCheckedAt && t.gcalCheckedAt.getTime() > Date.now() - 6 * H) continue;
        const calTask = t.calendarTaskId
          ? await prisma.task.findUnique({ where: { id: t.calendarTaskId } })
          : null;
        const exists = calTask ? await taskEventExists(calTask) : false;
        if (exists === true) {
          await setGcal(t.id, "synced", null, true);
          result.synced++;
          continue;
        }
        if (exists === null) continue; // תקלה זמנית — לא נוגעים
        // האירוע נמחק ביומן — יוצרים מחדש ומדווחים.
        if (calTask) {
          await prisma.task
            .update({ where: { id: calTask.id }, data: { googleEventId: null, googleEventOwnerId: null } })
            .catch(() => {});
        }
        const state = await syncDesignTaskCalendar(t.id);
        if (state === "synced") {
          result.recreated++;
          recreatedTitles.push({ title: t.title, designer: t.designer?.name ?? "" });
        }
        continue;
      }

      // none/pending/blocked — ניסיון סנכרון (מטפל בעצמו בכל המקרים).
      const prev = t.gcalState;
      const state = await syncDesignTaskCalendar(t.id);
      if (state === "synced") result.synced++;
      if (state === "blocked") {
        result.blocked++;
        if (prev !== "blocked") {
          newlyBlocked.push({
            title: t.title,
            designer: t.designer?.name ?? "לא ידוע",
            error: "לא חיברה יומן Google",
          });
        }
      }
    } catch (err) {
      console.error("[studio-gcal]", t.id, err);
    }
  }

  // התראות למנהלים — רק על שינויים (בלי ספאם על מצב קיים).
  if (newlyBlocked.length > 0 || recreatedTitles.length > 0) {
    const managers = await prisma.user.findMany({
      where: { role: "ADMIN", adminRole: "manager", active: true },
      select: { whatsappPhone: true, phone: true },
    });
    const targets = managers
      .map((m) => m.whatsappPhone || m.phone)
      .filter((x): x is string => Boolean(x));
    const lines: string[] = [];
    if (newlyBlocked.length > 0) {
      lines.push("🎨⚠️ משימות סטודיו שלא נכנסו ליומן:");
      for (const b of newlyBlocked) lines.push(`• "${b.title}" — ${b.designer}: ${b.error}`);
    }
    if (recreatedTitles.length > 0) {
      lines.push("🎨🔁 אירועים שנמחקו מהיומן ונוצרו מחדש:");
      for (const r of recreatedTitles) lines.push(`• "${r.title}" — ${r.designer}`);
    }
    for (const to of targets) {
      await sendMessage({
        channel: "whatsapp",
        to,
        body: lines.join("\n"),
        kind: "automation",
        clientId: null,
      }).catch(() => {});
    }
  }

  return result;
}
