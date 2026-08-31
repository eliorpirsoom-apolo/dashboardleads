import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { PageHeader, Card } from "@/components/ui";
import { Icon } from "@/components/Icon";
import { formatTime, formatCurrency } from "@/lib/format";
import { ilDayStart, ilDayEnd } from "@/lib/time";
import { ilGreeting } from "@/lib/greeting";
import { teamGoogleEvents, type GoogleEvent } from "@/lib/gcal";
import EngagementsPanel from "@/components/EngagementsPanel";

function shortDate(d: Date): string {
  return new Intl.DateTimeFormat("he-IL", {
    timeZone: "Asia/Jerusalem",
    day: "2-digit",
    month: "2-digit",
  }).format(d);
}

function daysStale(updatedAt: Date): number {
  return Math.floor((Date.now() - updatedAt.getTime()) / 86_400_000);
}

export const dynamic = "force-dynamic";

// Agency home — one morning glance: what's happening across all clients.
export default async function AdminDashboard() {
  const user = (await getSession())!;
  const now = new Date();
  const dayStart = ilDayStart(now);
  const dayEnd = ilDayEnd(now);
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  const [activeClients, leadsWeek, leadsToday, openAgencyTasks, todayItems] =
    await Promise.all([
      prisma.client.count({ where: { active: true } }),
      prisma.lead.count({ where: { receivedAt: { gte: weekAgo }, archived: false } }),
      prisma.lead.count({ where: { receivedAt: { gte: dayStart }, archived: false } }),
      prisma.task.count({ where: { status: "open", ownerSide: "agency" } }),
      prisma.task.findMany({
        where: { status: "open", dueAt: { gte: dayStart, lt: dayEnd } },
        orderBy: { dueAt: "asc" },
        take: 8,
        include: { client: { select: { name: true, color: true } } },
      }),
    ]);

  // הפאנלים: יומני Google של צוות המשרד (שבועיים קדימה — מזין גם את "לוז
  // פגישות" וגם את פאנלי היום) והצעות מחיר פתוחות. כשל ביומנים לא מפיל את הסקירה.
  const twoWeeksAhead = new Date(dayStart.getTime() + 14 * 24 * 60 * 60 * 1000);
  const [gcal, openQuotes] = await Promise.all([
    teamGoogleEvents(dayStart.toISOString(), twoWeeksAhead.toISOString()).catch(
      () => ({ events: [] as GoogleEvent[], connections: [] as { userId: string; name: string; email: string; color: string; error: string | null }[] })
    ),
    prisma.quote.findMany({
      where: { status: { in: ["sent", "followup"] } },
      orderBy: { sentAt: "desc" },
      take: 30,
      include: { client: { select: { name: true } } },
    }),
  ]);

  // נתוני סטודיו לסקירה.
  const [studioInProgress, studioAwaitingClient, studioAwaitingQc, studioOverdue] =
    await Promise.all([
      prisma.designTask.count({ where: { status: "in_progress" } }),
      prisma.designTask.count({ where: { status: "sent_to_client" } }),
      prisma.designTask.count({ where: { status: { in: ["final_review", "qc"] } } }),
      prisma.designTask.count({ where: { overdue: true, status: { not: "approved" } } }),
    ]);

  // פגישות היום: אירועי Google עם שעה (לא יום-שלם) + פגישות מהמערכת.
  // (המשיכה מגוגל היא לשבועיים — כאן מסננים להיום בלבד.)
  const todayMeetings = [
    ...gcal.events
      .filter((e) => !e.allDay && new Date(e.start).getTime() < dayEnd.getTime())
      .map((e) => ({
        key: e.id,
        at: new Date(e.start),
        title: e.title,
        who: e.ownerName,
        color: e.color,
        source: "google" as const,
      })),
    ...todayItems
      .filter((t) => t.type === "meeting")
      .map((t) => ({
        key: t.id,
        at: t.dueAt,
        title: t.title,
        who: t.client?.name ?? "פנימי",
        color: "#a78bfa",
        source: "system" as const,
      })),
  ].sort((a, b) => a.at.getTime() - b.at.getTime());

  // עכשיו בצוות: לכל יומן מחובר — האירוע שרץ ברגע זה.
  const nowMs = now.getTime();

  // 📆 לוז פגישות: מהיומנים של צוות המשרד בלבד (לא לקוחות) — אירועים עם שעה
  // שהכותרת שלהם נשמעת כמו פגישה, + זימוני צוות מהמערכת (teamKey).
  const MEETING_WORDS = /פגיש|סיכום|meeting/i;
  const teamInvites = await prisma.task.findMany({
    where: {
      teamKey: { not: null },
      status: { in: ["open", "in_progress"] },
      dueAt: { gte: now },
    },
    orderBy: { dueAt: "asc" },
    take: 60,
    select: { teamKey: true, title: true, dueAt: true, type: true },
  });
  const seenTeam = new Set<string>();
  const scheduleBoard = [
    ...gcal.events
      .filter(
        (e) =>
          !e.allDay &&
          MEETING_WORDS.test(e.title || "") &&
          new Date(e.end).getTime() > nowMs
      )
      .map((e) => ({
        id: e.id,
        start: new Date(e.start),
        title: e.title,
        owner: e.ownerName,
        color: e.color,
      })),
    ...teamInvites
      .filter((t) => {
        if (seenTeam.has(t.teamKey!)) return false;
        seenTeam.add(t.teamKey!);
        return true;
      })
      .map((t) => ({
        id: `team-${t.teamKey}`,
        start: t.dueAt,
        title: `👥 ${t.title}`,
        owner: "כל הצוות",
        color: "#3a5bd9",
      })),
  ]
    .sort((a, b) => a.start.getTime() - b.start.getTime())
    .slice(0, 20);
  const teamNow = gcal.connections.map((c) => {
    const current = gcal.events
      .filter((e) => e.ownerId === c.userId && !e.allDay)
      .find((e) => new Date(e.start).getTime() <= nowMs && new Date(e.end).getTime() > nowMs);
    return { ...c, current };
  });

  const kpis = [
    { label: "לקוחות פעילים", value: activeClients, icon: "users" as const, color: "#3a5bd9", href: "/admin/clients" },
    { label: "לידים היום", value: leadsToday, icon: "leads" as const, color: "#06b6d4", href: "/admin/clients" },
    { label: "לידים ב-7 ימים", value: leadsWeek, icon: "chart" as const, color: "#8b5cf6", href: "/admin/clients" },
    { label: "משימות משרד פתוחות", value: openAgencyTasks, icon: "tasks" as const, color: "#f59e0b", href: "/admin/tasks" },
  ];

  const studioTiles = [
    { label: "בעבודה", value: studioInProgress, color: "#06b6d4" },
    { label: "ממתין ללקוח", value: studioAwaitingClient, color: "#f59e0b" },
    { label: "ממתין לאישור סופי", value: studioAwaitingQc, color: "#8b5cf6" },
    { label: "באיחור", value: studioOverdue, color: "#ef4444" },
  ];

  return (
    <>
      <PageHeader
        title={`${ilGreeting()}, ${user.name.split(" ")[0]}`}
        subtitle="סקירה כללית — תמונת מצב כלל הלקוחות"
      />

      {/* שורת KPI — כרטיסי מדד מלוטשים (סיכום לידים/מדדים) */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {kpis.map((k) => (
          <Link
            key={k.label}
            href={k.href}
            className="group relative overflow-hidden rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
          >
            <span
              className="absolute inset-x-0 top-0 h-1 opacity-80"
              style={{ background: `linear-gradient(90deg, ${k.color}, transparent)` }}
            />
            <span
              className="flex h-9 w-9 items-center justify-center rounded-xl"
              style={{ backgroundColor: `${k.color}1a`, color: k.color }}
            >
              <Icon name={k.icon} className="h-5 w-5" />
            </span>
            <div className="mt-3 text-3xl font-bold tabular-nums text-slate-900">{k.value}</div>
            <div className="mt-0.5 text-xs text-slate-500">{k.label}</div>
          </Link>
        ))}
      </div>

      {/* 🎨 סטודיו — רצועת סטטוס */}
      <section className="relative mt-4 overflow-hidden rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <span className="absolute inset-x-0 top-0 h-1 bg-gradient-to-l from-[#3a5bd9] via-[#8b5cf6] to-transparent" />
        <div className="mb-3 flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-base font-bold text-slate-900">
            <span>🎨</span> סטודיו
          </h2>
          <Link href="/admin/studio" className="text-xs font-semibold text-[#3a5bd9] hover:underline">
            ללוח הסטודיו ←
          </Link>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {studioTiles.map((s) => (
            <Link
              key={s.label}
              href="/admin/studio"
              className="group relative overflow-hidden rounded-xl border border-slate-200 bg-slate-50 p-3 text-center transition hover:-translate-y-0.5 hover:bg-white hover:shadow-sm"
            >
              <div className="text-3xl font-bold tabular-nums" style={{ color: s.color }}>
                {s.value}
              </div>
              <div className="mt-0.5 text-[11px] font-medium text-slate-500">{s.label}</div>
            </Link>
          ))}
        </div>
      </section>

      {/* שורת הפאנלים: פגישות היום · עכשיו בצוות · לוז פגישות · הצעות מחיר */}
      <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {/* 📅 פגישות היום — מהיומנים המחוברים + פגישות המערכת */}
        <Card className="glass-hover flex h-72 flex-col">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-sm font-bold text-slate-900">📅 פגישות היום</h2>
            <Link href="/admin/calendar" className="text-xs font-medium text-[#3a5bd9] hover:underline">
              ללוח ←
            </Link>
          </div>
          {todayMeetings.length === 0 ? (
            <p className="flex flex-1 items-center justify-center text-xs text-slate-600">
              אין פגישות היום 🎉
            </p>
          ) : (
            <div className="thin-scroll flex flex-1 flex-col gap-1.5 overflow-y-auto pl-1">
              {todayMeetings.map((m) => (
                <div
                  key={m.key}
                  className="flex items-center gap-2 rounded-lg border border-slate-200 px-2.5 py-1.5"
                  style={{ borderInlineStartColor: m.color, borderInlineStartWidth: 3 }}
                >
                  <span className="font-mono text-[11px] text-slate-500">{formatTime(m.at)}</span>
                  <span className="flex-1 truncate text-xs text-slate-700">{m.title}</span>
                  <span className="text-[10px] text-slate-500">{m.who}</span>
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* ⏱️ עכשיו בצוות — מה שרץ ברגע זה בכל יומן מחובר */}
        <Card className="glass-hover flex h-72 flex-col">
          <h2 className="mb-2 text-sm font-bold text-slate-900">⏱️ עכשיו בצוות</h2>
          {teamNow.length === 0 ? (
            <p className="flex flex-1 items-center justify-center px-4 text-center text-xs text-slate-600">
              אין יומנים מחוברים — חברו יומן Google מלוח השנה
            </p>
          ) : (
            <div className="thin-scroll flex flex-1 flex-col gap-1.5 overflow-y-auto pl-1">
              {teamNow.map((m) => (
                <div
                  key={m.userId}
                  className="flex items-center gap-2 rounded-lg border border-slate-200 px-2.5 py-1.5"
                >
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: m.color }} />
                  <span className="w-20 truncate text-xs font-medium text-slate-600">{m.name}</span>
                  {m.current ? (
                    <span className="flex-1 truncate text-xs text-slate-700">{m.current.title}</span>
                  ) : (
                    <span className="flex-1 text-xs text-emerald-500">פנוי ✓</span>
                  )}
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* 📆 לוז פגישות — מיומני צוות המשרד בלבד, לפי מילות מפתח בכותרת */}
        <Card className="glass-hover flex h-72 flex-col">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-sm font-bold text-slate-900">📆 לוז פגישות</h2>
            <Link href="/admin/calendar" className="text-xs font-medium text-[#3a5bd9] hover:underline">
              ללוח ←
            </Link>
          </div>
          {scheduleBoard.length === 0 ? (
            <p className="flex flex-1 items-center justify-center px-4 text-center text-xs text-slate-600">
              {gcal.connections.length === 0
                ? "אין יומנים מחוברים — חברו יומן Google מהחשבון שלי"
                : "אין פגישות קרובות ביומני הצוות"}
            </p>
          ) : (
            <div className="thin-scroll flex flex-1 flex-col gap-1.5 overflow-y-auto pl-1">
              {scheduleBoard.map((e) => (
                <div
                  key={e.id}
                  className="flex items-center gap-2 rounded-lg border border-slate-200 px-2.5 py-1.5"
                  style={{ borderInlineStartColor: e.color, borderInlineStartWidth: 3 }}
                >
                  <span className="font-mono text-[10px] text-slate-600">{shortDate(e.start)}</span>
                  <span className="font-mono text-[11px] text-slate-500">{formatTime(e.start)}</span>
                  <span className="flex-1 truncate text-xs text-slate-700">{e.title}</span>
                  <span className="max-w-[80px] truncate text-[10px] text-slate-500">{e.owner}</span>
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* 📄 הצעות מחיר ממתינות — הכי מוזנחת קודם */}
        <Card className="glass-hover flex h-72 flex-col">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-sm font-bold text-slate-900">📄 הצעות מחיר ממתינות</h2>
            <Link href="/admin/quotes" className="text-xs font-medium text-[#3a5bd9] hover:underline">
              לכולן ←
            </Link>
          </div>
          {openQuotes.length === 0 ? (
            <p className="flex flex-1 items-center justify-center px-4 text-center text-xs text-slate-600">
              אין הצעות פתוחות — רושמים ב&quot;הצעות מחיר&quot; בתפריט
            </p>
          ) : (
            <div className="thin-scroll flex flex-1 flex-col gap-1.5 overflow-y-auto pl-1">
              {openQuotes.map((q) => {
                const days = daysStale(q.updatedAt);
                return (
                  <Link
                    key={q.id}
                    href="/admin/quotes"
                    className="flex items-center gap-2 rounded-lg border border-slate-200 px-2.5 py-1.5 transition hover:border-[#3a5bd9]/40"
                  >
                    <span className="flex-1 truncate text-xs text-slate-700">
                      {q.recipient}
                      <span className="text-slate-500"> · {q.title}</span>
                    </span>
                    <span className="shrink-0 font-mono text-[10px] text-slate-600">{shortDate(q.sentAt)}</span>
                    {q.amount ? (
                      <span className="text-[10px] text-slate-500">{formatCurrency(q.amount)}</span>
                    ) : null}
                    <span
                      className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-bold ${
                        days >= 4
                          ? "bg-red-500/15 text-red-600"
                          : days >= 2
                            ? "bg-amber-500/15 text-amber-700"
                            : "bg-slate-100 text-slate-500"
                      }`}
                    >
                      {days === 0 ? "היום" : `${days} ימים`}
                    </span>
                  </Link>
                );
              })}
            </div>
          )}
        </Card>
      </div>

      {/* "היום שלי" ו"לידים אחרונים" הוסרו — החלטת הבעלים 2026-08-31:
          לוז הלקוחות והלידים שלהם לא שייכים לסקירת המשרד. */}

      {/* 🚀 נכנס לעבודה — רוחב מלא */}
      <div className="mt-4">
        <EngagementsPanel />
      </div>
    </>
  );
}
