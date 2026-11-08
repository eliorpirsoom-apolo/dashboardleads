import { prisma } from "./prisma";
import { gcalAccessToken } from "./gcal";

// ---------------------------------------------------------------------------
// סנכרון ימי צילום ל-Google Calendar. האירוע נוצר על היומן של איש-צוות מחובר
// (הראשון עם חיבור פעיל; אחרת יוצר היום). רוכב על אותו OAuth/טוקנים של gcal.ts.
// best-effort — לעולם לא זורק (כשל יומן לא מפיל יצירת/עדכון יום צילום).
// ---------------------------------------------------------------------------

const CAL_API = "https://www.googleapis.com/calendar/v3";
const DEFAULT_DURATION_MIN = 120;

type ShootWithRel = {
  id: string;
  title: string | null;
  date: Date;
  endAt: Date | null;
  location: string | null;
  types: string;
  client: { name: string } | null;
  project: { name: string } | null;
  crew: { userId: string; user: { name: string } | null }[];
  createdById: string | null;
};

const SHOOT_INCLUDE = {
  client: { select: { name: true } },
  project: { select: { name: true } },
  crew: { include: { user: { select: { name: true } } } },
} as const;

function eventBody(shoot: ShootWithRel) {
  const start = shoot.date;
  const end = shoot.endAt ?? new Date(start.getTime() + DEFAULT_DURATION_MIN * 60_000);
  let types: string[] = [];
  try {
    const p = JSON.parse(shoot.types);
    if (Array.isArray(p)) types = p.map(String);
  } catch {
    /* ignore */
  }
  const crewNames = shoot.crew.map((c) => c.user?.name).filter(Boolean).join(", ");
  const desc = [
    shoot.client?.name ? `לקוח: ${shoot.client.name}` : null,
    shoot.project?.name ? `פרויקט: ${shoot.project.name}` : null,
    types.length ? `סוג: ${types.join(", ")}` : null,
    crewNames ? `צוות: ${crewNames}` : null,
    "— נוצר ב-Apollo CRM",
  ].filter(Boolean).join("\n");
  return {
    summary: `🎬 צילום: ${shoot.title || shoot.client?.name || "יום צילום"}`,
    description: desc,
    location: shoot.location ?? undefined,
    start: { dateTime: start.toISOString(), timeZone: "Asia/Jerusalem" },
    end: { dateTime: end.toISOString(), timeZone: "Asia/Jerusalem" },
  };
}

// היומן שעליו ייווצר האירוע: איש-צוות מחובר ראשון, אחרת יוצר היום.
async function ownerConnectionFor(shoot: ShootWithRel) {
  const ids = [...shoot.crew.map((c) => c.userId), shoot.createdById].filter(Boolean) as string[];
  for (const userId of ids) {
    const conn = await prisma.calendarConnection.findUnique({ where: { userId } });
    if (conn?.active) return conn;
  }
  return null;
}

/** יצירת אירוע יומן ליום צילום. best-effort. */
export async function createShootEvent(shootId: string): Promise<void> {
  try {
    const shoot = (await prisma.shootDay.findUnique({ where: { id: shootId }, include: SHOOT_INCLUDE })) as ShootWithRel | null;
    if (!shoot) return;
    const conn = await ownerConnectionFor(shoot);
    if (!conn) return; // אין יומן מחובר — מדלגים בשקט
    const token = await gcalAccessToken(conn);
    const res = await fetch(`${CAL_API}/calendars/primary/events`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(eventBody(shoot)),
    });
    if (!res.ok) throw new Error(`gcal create ${res.status}`);
    const event = (await res.json()) as { id: string };
    await prisma.shootDay.update({
      where: { id: shoot.id },
      data: { gcalEventId: event.id, gcalOwnerId: conn.userId },
    });
  } catch (err) {
    console.error("[shoot-gcal create]", err);
  }
}

/** עדכון האירוע המקושר אחרי שינוי יום צילום. אם אין אירוע עדיין — יוצר. */
export async function syncShootEvent(shootId: string): Promise<void> {
  try {
    const shoot = (await prisma.shootDay.findUnique({ where: { id: shootId }, include: SHOOT_INCLUDE })) as (ShootWithRel & { gcalEventId: string | null; gcalOwnerId: string | null }) | null;
    if (!shoot) return;
    if (!shoot.gcalEventId || !shoot.gcalOwnerId) {
      await createShootEvent(shootId);
      return;
    }
    const conn = await prisma.calendarConnection.findUnique({ where: { userId: shoot.gcalOwnerId } });
    if (!conn?.active) return;
    const token = await gcalAccessToken(conn);
    await fetch(`${CAL_API}/calendars/primary/events/${encodeURIComponent(shoot.gcalEventId)}`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(eventBody(shoot)),
    });
  } catch (err) {
    console.error("[shoot-gcal sync]", err);
  }
}

/** מחיקת האירוע המקושר (יום צילום נמחק). */
export async function deleteShootEvent(gcalEventId: string | null, gcalOwnerId: string | null): Promise<void> {
  try {
    if (!gcalEventId || !gcalOwnerId) return;
    const conn = await prisma.calendarConnection.findUnique({ where: { userId: gcalOwnerId } });
    if (!conn?.active) return;
    const token = await gcalAccessToken(conn);
    await fetch(`${CAL_API}/calendars/primary/events/${encodeURIComponent(gcalEventId)}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
  } catch (err) {
    console.error("[shoot-gcal delete]", err);
  }
}
