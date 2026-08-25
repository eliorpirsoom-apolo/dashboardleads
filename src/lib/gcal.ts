import { prisma } from "./prisma";
import type { CalendarConnection } from "@prisma/client";

// ---------------------------------------------------------------------------
// Google Calendar — "כל יומני הצוות במקום אחד" + סנכרון דו-כיווני:
//   קריאה: הלוח המשותף מציג את האירועים מכל היומנים של כל עובד מחובר.
//   כתיבה: משימה/פגישה שנוצרת במערכת נכתבת ליומן ה-primary של המשתמש.
// אותו OAuth client של הכניסה; scope מלא של Calendar; refresh token פר-עובד.
// ---------------------------------------------------------------------------

const CAL_API = "https://www.googleapis.com/calendar/v3";

// צבע קבוע פר-עובד בלוח — מוקצה לפי סדר החיבור.
export const CONNECTION_COLORS = [
  "#f59e0b", // amber
  "#34d399", // emerald
  "#f472b6", // pink
  "#a78bfa", // violet
  "#38bdf8", // sky
  "#fb923c", // orange
  "#4ade80", // green
  "#e879f9", // fuchsia
];

export interface GoogleEvent {
  id: string;
  title: string;
  start: string; // ISO
  end: string; // ISO
  allDay: boolean;
  ownerId: string; // CRM user id
  ownerName: string;
  color: string;
  calendarName: string;
  link: string | null;
}

/** Fresh access token for a connection (cached until expiry).
 *  force=true מדלג על המטמון — לניסיון חוזר אחרי שגוגל דחה טוקן "תקף". */
export async function gcalAccessToken(
  conn: CalendarConnection,
  force = false
): Promise<string> {
  if (
    !force &&
    conn.accessToken &&
    conn.expiresAt &&
    conn.expiresAt.getTime() > Date.now() + 60_000
  ) {
    return conn.accessToken;
  }
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      refresh_token: conn.refreshToken,
      grant_type: "refresh_token",
    }),
  });
  if (!res.ok) {
    // 400/401 = הטוקן בוטל או פג (invalid_grant) — לא יתוקן מעצמו: מנטרלים את
    // החיבור כדי שהמערכת תדווח "צריך לחבר מחדש" במקום להיתקע על ניסיונות שווא.
    const dead = res.status === 400 || res.status === 401;
    await prisma.calendarConnection.update({
      where: { id: conn.id },
      data: {
        lastError: dead
          ? `token refresh ${res.status} — החיבור פג, נדרש חיבור מחדש`
          : `token refresh ${res.status}`,
        ...(dead ? { active: false } : {}),
      },
    });
    throw new Error(
      dead
        ? `חיבור היומן פג (רענון טוקן ${res.status}) — יש להתחבר מחדש ליומן Google`
        : `רענון טוקן יומן נכשל (${res.status})`
    );
  }
  const data = (await res.json()) as { access_token: string; expires_in: number };
  await prisma.calendarConnection.update({
    where: { id: conn.id },
    data: {
      accessToken: data.access_token,
      expiresAt: new Date(Date.now() + data.expires_in * 1000),
      lastError: null,
    },
  });
  return data.access_token;
}

/** All events from every calendar of one connection, in a time window. */
async function eventsForConnection(
  conn: CalendarConnection & { user: { name: string } },
  timeMin: string,
  timeMax: string
): Promise<GoogleEvent[]> {
  const token = await gcalAccessToken(conn);
  const auth = { Authorization: `Bearer ${token}` };

  const calsRes = await fetch(
    `${CAL_API}/users/me/calendarList?minAccessRole=reader&fields=items(id,summary,selected,primary)`,
    { headers: auth }
  );
  if (!calsRes.ok) throw new Error(`calendarList ${calsRes.status}`);
  const cals = ((await calsRes.json()).items ?? []) as {
    id: string;
    summary: string;
    selected?: boolean;
    primary?: boolean;
  }[];
  // "selected" = calendars the user shows in their own Google UI.
  const visible = cals.filter((c) => c.selected || c.primary);

  const perCal = await Promise.all(
    visible.map(async (cal) => {
      const p = new URLSearchParams({
        timeMin,
        timeMax,
        singleEvents: "true",
        orderBy: "startTime",
        maxResults: "250",
        fields:
          "items(id,summary,start,end,htmlLink,status,eventType)",
      });
      const res = await fetch(
        `${CAL_API}/calendars/${encodeURIComponent(cal.id)}/events?${p}`,
        { headers: auth }
      );
      if (!res.ok) return [];
      const items = ((await res.json()).items ?? []) as any[];
      return items
        .filter((e) => e.status !== "cancelled")
        .map((e): GoogleEvent => {
          const allDay = Boolean(e.start?.date);
          return {
            id: `${conn.userId}:${e.id}`,
            title: e.summary || "(ללא כותרת)",
            start: e.start?.dateTime ?? `${e.start?.date}T00:00:00`,
            end: e.end?.dateTime ?? `${e.end?.date}T00:00:00`,
            allDay,
            ownerId: conn.userId,
            ownerName: conn.user.name,
            color: conn.color,
            calendarName: cal.summary,
            link: e.htmlLink ?? null,
          };
        });
    })
  );
  return perCal.flat();
}

/** Merged team calendar: events of every active connection. Errors per
 *  connection are recorded and skipped — one broken token never hides the
 *  rest of the team. */
export async function teamGoogleEvents(
  timeMin: string,
  timeMax: string
): Promise<{ events: GoogleEvent[]; connections: { userId: string; name: string; email: string; color: string; error: string | null }[] }> {
  const conns = await prisma.calendarConnection.findMany({
    where: { active: true },
    include: { user: { select: { name: true } } },
  });
  const results = await Promise.all(
    conns.map(async (conn) => {
      try {
        return { conn, events: await eventsForConnection(conn, timeMin, timeMax), error: null as string | null };
      } catch (err) {
        const msg = String((err as Error).message ?? err).slice(0, 200);
        await prisma.calendarConnection
          .update({ where: { id: conn.id }, data: { lastError: msg } })
          .catch(() => {});
        return { conn, events: [] as GoogleEvent[], error: msg };
      }
    })
  );
  return {
    events: results.flatMap((r) => r.events),
    connections: results.map((r) => ({
      userId: r.conn.userId,
      name: r.conn.user.name,
      email: r.conn.googleEmail,
      color: r.conn.color,
      error: r.error ?? r.conn.lastError,
    })),
  };
}

// --- Two-way: system tasks/meetings → the user's primary calendar ----------

function taskEventBody(task: {
  title: string;
  description?: string | null;
  dueAt: Date;
  durationMin?: number | null;
  location?: string | null;
  type: string;
}) {
  const start = task.dueAt;
  const end = new Date(
    start.getTime() + (task.durationMin ?? 60) * 60_000
  );
  return {
    summary: task.title,
    description: [task.description, "— נוצר ב-Apollo CRM"].filter(Boolean).join("\n"),
    location: task.location ?? undefined,
    start: { dateTime: start.toISOString(), timeZone: "Asia/Jerusalem" },
    end: { dateTime: end.toISOString(), timeZone: "Asia/Jerusalem" },
  };
}

/** The connection a task's Google event should live in: assignee first,
 *  falling back to the creator. */
export async function connectionForTask(task: {
  assigneeId?: string | null;
  createdById?: string | null;
}): Promise<CalendarConnection | null> {
  for (const userId of [task.assigneeId, task.createdById]) {
    if (!userId) continue;
    const conn = await prisma.calendarConnection.findUnique({
      where: { userId },
    });
    if (conn?.active) return conn;
  }
  return null;
}

/** Create the Google event for a task. Best-effort: never throws — the returned
 *  error (אם יש) מאפשר לקורא להציג את הסיבה האמיתית (למשל "החיבור פג"). */
export async function createTaskEvent(task: {
  id: string;
  title: string;
  description?: string | null;
  dueAt: Date;
  durationMin?: number | null;
  location?: string | null;
  type: string;
  assigneeId?: string | null;
  createdById?: string | null;
}): Promise<{ ok: boolean; error?: string }> {
  try {
    const conn = await connectionForTask(task);
    if (!conn) return { ok: false, error: "אין יומן Google מחובר" };
    const token = await gcalAccessToken(conn);
    const attempt = (tok: string) =>
      fetch(`${CAL_API}/calendars/primary/events`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${tok}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(taskEventBody(task)),
      });
    let res = await attempt(token);
    if (res.status === 401 || res.status === 403) {
      // גוגל דחה טוקן שנראה תקף — רענון כפוי וניסיון אחד נוסף.
      res = await attempt(await gcalAccessToken(conn, true));
      if (res.status === 401 || res.status === 403) {
        // גם טוקן טרי נדחה ⇒ להרשאה אין גישת יומן (בוטלה או לא אושרה בהתחברות).
        // לא יתוקן מעצמו — מנטרלים את החיבור כדי שהמערכת תדרוש חיבור מחדש ותתריע.
        await prisma.calendarConnection.update({
          where: { id: conn.id },
          data: {
            active: false,
            lastError: `Google ${res.status} — אין גישת יומן, נדרש חיבור מחדש`,
          },
        });
        return {
          ok: false,
          error: `גוגל דוחה את הרשאת היומן (${res.status}) — יש להתחבר מחדש ליומן Google ולאשר גישת יומן`,
        };
      }
    }
    if (!res.ok) throw new Error(`יצירת אירוע נכשלה (Google ${res.status})`);
    const event = (await res.json()) as { id: string };
    await prisma.task.update({
      where: { id: task.id },
      data: { googleEventId: event.id, googleEventOwnerId: conn.userId },
    });
    return { ok: true };
  } catch (err: any) {
    console.error("[gcal create]", err);
    return { ok: false, error: String(err?.message || err).slice(0, 300) };
  }
}

/** Update (or delete) the linked Google event after a task change. */
export async function syncTaskEvent(taskId: string): Promise<void> {
  try {
    const task = await prisma.task.findUnique({ where: { id: taskId } });
    if (!task?.googleEventId || !task.googleEventOwnerId) return;
    const conn = await prisma.calendarConnection.findUnique({
      where: { userId: task.googleEventOwnerId },
    });
    if (!conn?.active) return;
    const token = await gcalAccessToken(conn);

    if (task.status === "canceled") {
      await fetch(
        `${CAL_API}/calendars/primary/events/${encodeURIComponent(task.googleEventId)}`,
        { method: "DELETE", headers: { Authorization: `Bearer ${token}` } }
      );
      await prisma.task.update({
        where: { id: task.id },
        data: { googleEventId: null, googleEventOwnerId: null },
      });
      return;
    }

    const body: Record<string, unknown> = taskEventBody(task);
    if (task.status === "done") body.summary = `✓ ${task.title}`;
    await fetch(
      `${CAL_API}/calendars/primary/events/${encodeURIComponent(task.googleEventId)}`,
      {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      }
    );
  } catch (err) {
    console.error("[gcal sync]", err);
  }
}

/** Does the linked Google event still exist (and isn't cancelled)?
 *  Returns null when it can't be checked (no link / no active connection). */
export async function taskEventExists(task: {
  googleEventId?: string | null;
  googleEventOwnerId?: string | null;
}): Promise<boolean | null> {
  if (!task.googleEventId || !task.googleEventOwnerId) return null;
  const conn = await prisma.calendarConnection.findUnique({
    where: { userId: task.googleEventOwnerId },
  });
  if (!conn?.active) return null;
  const token = await gcalAccessToken(conn);
  const res = await fetch(
    `${CAL_API}/calendars/primary/events/${encodeURIComponent(task.googleEventId)}?fields=status`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (res.status === 404 || res.status === 410) return false;
  if (!res.ok) return null; // תקלה זמנית — לא מסיקים כלום
  const data = (await res.json()) as { status?: string };
  return data.status !== "cancelled";
}

/** מצב האירוע ביומן — קיום + מועדי התחלה/סיום. מאפשר לסנכרן חזרה למערכת
 *  גרירה של האירוע ביומן Google (מועד חדש). null = לא ניתן לבדוק כרגע. */
export async function getTaskEventState(task: {
  googleEventId?: string | null;
  googleEventOwnerId?: string | null;
}): Promise<{ exists: boolean; start?: Date; end?: Date } | null> {
  if (!task.googleEventId || !task.googleEventOwnerId) return null;
  const conn = await prisma.calendarConnection.findUnique({
    where: { userId: task.googleEventOwnerId },
  });
  if (!conn?.active) return null;
  const token = await gcalAccessToken(conn);
  const res = await fetch(
    `${CAL_API}/calendars/primary/events/${encodeURIComponent(task.googleEventId)}?fields=status,start,end`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (res.status === 404 || res.status === 410) return { exists: false };
  if (!res.ok) return null; // תקלה זמנית — לא מסיקים כלום
  const data = (await res.json()) as {
    status?: string;
    start?: { dateTime?: string; date?: string };
    end?: { dateTime?: string; date?: string };
  };
  if (data.status === "cancelled") return { exists: false };
  return {
    exists: true,
    // אירועי יום-שלם (date בלי dateTime) — בלי אימוץ שעה.
    start: data.start?.dateTime ? new Date(data.start.dateTime) : undefined,
    end: data.end?.dateTime ? new Date(data.end.dateTime) : undefined,
  };
}

/** Delete the linked Google event (task deleted in the system). */
export async function deleteTaskEvent(task: {
  googleEventId?: string | null;
  googleEventOwnerId?: string | null;
}): Promise<void> {
  try {
    if (!task.googleEventId || !task.googleEventOwnerId) return;
    const conn = await prisma.calendarConnection.findUnique({
      where: { userId: task.googleEventOwnerId },
    });
    if (!conn?.active) return;
    const token = await gcalAccessToken(conn);
    await fetch(
      `${CAL_API}/calendars/primary/events/${encodeURIComponent(task.googleEventId)}`,
      { method: "DELETE", headers: { Authorization: `Bearer ${token}` } }
    );
  } catch (err) {
    console.error("[gcal delete]", err);
  }
}
