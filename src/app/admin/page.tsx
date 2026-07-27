import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { PageHeader, StatCard, Card, Chip } from "@/components/ui";
import { Icon } from "@/components/Icon";
import { formatTime, formatCurrency } from "@/lib/format";
import { ilDayStart, ilDayEnd } from "@/lib/time";
import { ilGreeting } from "@/lib/greeting";
import { wonDeals } from "@/lib/wins";
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

  const [activeClients, leadsWeek, leadsToday, openAgencyTasks, todayItems, recentLeads] =
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
      prisma.lead.findMany({
        where: { archived: false },
        orderBy: { receivedAt: "desc" },
        take: 8,
        include: {
          client: { select: { id: true, name: true, color: true } },
          status: { select: { name: true, color: true } },
        },
      }),
    ]);

  // ארבעת הפאנלים: עסקאות 30 יום, יומני Google (עכשיו + פגישות היום),
  // והצעות מחיר פתוחות. כשל ביומני Google לא מפיל את הסקירה.
  const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const [deals, gcal, openQuotes] = await Promise.all([
    wonDeals(monthAgo, now).catch(() => []),
    teamGoogleEvents(dayStart.toISOString(), dayEnd.toISOString()).catch(
      () => ({ events: [] as GoogleEvent[], connections: [] as { userId: string; name: string; email: string; color: string; error: string | null }[] })
    ),
    prisma.quote.findMany({
      where: { status: { in: ["sent", "followup"] } },
      orderBy: { sentAt: "desc" },
      take: 30,
      include: { client: { select: { name: true } } },
    }),
  ]);

  // פגישות היום: אירועי Google עם שעה (לא יום-שלם) + פגישות מהמערכת.
  const todayMeetings = [
    ...gcal.events
      .filter((e) => !e.allDay)
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
  const teamNow = gcal.connections.map((c) => {
    const current = gcal.events
      .filter((e) => e.ownerId === c.userId && !e.allDay)
      .find((e) => new Date(e.start).getTime() <= nowMs && new Date(e.end).getTime() > nowMs);
    return { ...c, current };
  });

  return (
    <>
      <PageHeader
        title={`${ilGreeting()}, ${user.name.split(" ")[0]}`}
        subtitle="סקירה כללית — תמונת מצב כלל הלקוחות"
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="לקוחות פעילים" value={activeClients} icon="users" />
        <StatCard label="לידים היום" value={leadsToday} icon="leads" />
        <StatCard label="לידים ב-7 ימים" value={leadsWeek} icon="chart" />
        <StatCard label="משימות משרד פתוחות" value={openAgencyTasks} icon="tasks" />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        {/* Today */}
        <Card>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-base font-bold text-slate-100">היום שלי</h2>
            <Link href="/admin/calendar" className="text-xs text-cyan-400 hover:underline">
              ללוח השנה ←
            </Link>
          </div>
          {todayItems.length === 0 ? (
            <p className="py-6 text-center text-sm text-slate-600">אין משימות להיום 🎉</p>
          ) : (
            <div className="flex flex-col gap-2">
              {todayItems.map((t) => (
                <div key={t.id} className="flex items-center gap-3 rounded-xl border border-slate-800 px-3 py-2">
                  <span className="font-mono text-xs text-slate-500">{formatTime(t.dueAt)}</span>
                  <Icon
                    name={t.type === "meeting" ? "calendar" : "tasks"}
                    className={`h-4 w-4 ${t.type === "meeting" ? "text-violet-400" : "text-cyan-400"}`}
                  />
                  <span className="flex-1 truncate text-sm text-slate-200">{t.title}</span>
                  {t.client ? (
                    <Chip color={t.client.color ?? "#64748b"}>{t.client.name}</Chip>
                  ) : (
                    <Chip color="#818cf8">פנימי</Chip>
                  )}
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* Recent leads across clients */}
        <Card>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-base font-bold text-slate-100">לידים אחרונים</h2>
            <Link href="/admin/clients" className="text-xs text-cyan-400 hover:underline">
              לכל הלקוחות ←
            </Link>
          </div>
          {recentLeads.length === 0 ? (
            <p className="py-6 text-center text-sm text-slate-600">אין לידים עדיין</p>
          ) : (
            <div className="thin-scroll flex max-h-80 flex-col gap-2 overflow-y-auto pl-1">
              {recentLeads.map((l) => (
                <Link
                  key={l.id}
                  href={`/admin/clients/${l.client.id}/leads`}
                  className="flex items-center gap-3 rounded-xl border border-slate-800 px-3 py-2 transition hover:border-cyan-500/40"
                >
                  <span className="flex-1 truncate text-sm text-slate-200">
                    {l.fullName ?? l.phone ?? "ליד"}
                  </span>
                  {l.status ? <Chip color={l.status.color}>{l.status.name}</Chip> : null}
                  <Chip color={l.client.color ?? "#64748b"}>{l.client.name}</Chip>
                </Link>
              ))}
            </div>
          )}
        </Card>
      </div>

      {/* שורת הפאנלים: פגישות היום · עכשיו בצוות · עסקאות שנסגרו · הצעות מחיר */}
      <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {/* 📅 פגישות היום — מהיומנים המחוברים + פגישות המערכת */}
        <Card className="flex h-72 flex-col">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-sm font-bold text-slate-100">📅 פגישות היום</h2>
            <Link href="/admin/calendar" className="text-xs text-cyan-400 hover:underline">
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
                  className="flex items-center gap-2 rounded-lg border border-slate-800 px-2.5 py-1.5"
                  style={{ borderInlineStartColor: m.color, borderInlineStartWidth: 3 }}
                >
                  <span className="font-mono text-[11px] text-slate-500">{formatTime(m.at)}</span>
                  <span className="flex-1 truncate text-xs text-slate-200">{m.title}</span>
                  <span className="text-[10px] text-slate-500">{m.who}</span>
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* ⏱️ עכשיו בצוות — מה שרץ ברגע זה בכל יומן מחובר */}
        <Card className="flex h-72 flex-col">
          <h2 className="mb-2 text-sm font-bold text-slate-100">⏱️ עכשיו בצוות</h2>
          {teamNow.length === 0 ? (
            <p className="flex flex-1 items-center justify-center px-4 text-center text-xs text-slate-600">
              אין יומנים מחוברים — חברו יומן Google מלוח השנה
            </p>
          ) : (
            <div className="thin-scroll flex flex-1 flex-col gap-1.5 overflow-y-auto pl-1">
              {teamNow.map((m) => (
                <div
                  key={m.userId}
                  className="flex items-center gap-2 rounded-lg border border-slate-800 px-2.5 py-1.5"
                >
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: m.color }} />
                  <span className="w-20 truncate text-xs font-medium text-slate-300">{m.name}</span>
                  {m.current ? (
                    <span className="flex-1 truncate text-xs text-slate-200">{m.current.title}</span>
                  ) : (
                    <span className="flex-1 text-xs text-emerald-400/80">פנוי ✓</span>
                  )}
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* 🔥 עסקאות שנסגרו — 30 הימים האחרונים */}
        <Card className="flex h-72 flex-col">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-sm font-bold text-slate-100">🔥 עסקאות שנסגרו</h2>
            <Chip color="#34d399">{deals.length}</Chip>
          </div>
          {deals.length === 0 ? (
            <p className="flex flex-1 items-center justify-center text-xs text-slate-600">
              אין עסקאות ב-30 הימים האחרונים
            </p>
          ) : (
            <div className="thin-scroll flex flex-1 flex-col gap-1.5 overflow-y-auto pl-1">
              {deals.map((d) => (
                <div
                  key={d.leadId}
                  className="flex items-center gap-2 rounded-lg border border-slate-800 px-2.5 py-1.5"
                >
                  <span className="flex-1 truncate text-xs text-slate-200">
                    {d.fullName ?? `ליד #${d.number}`}
                  </span>
                  <span className="max-w-[90px] truncate text-[10px] text-slate-500">
                    {d.projectName ?? d.clientName}
                  </span>
                  <span className="font-mono text-[10px] text-slate-600">{shortDate(d.at)}</span>
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* 📄 הצעות מחיר ממתינות — הכי מוזנחת קודם */}
        <Card className="flex h-72 flex-col">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-sm font-bold text-slate-100">📄 הצעות מחיר ממתינות</h2>
            <Link href="/admin/quotes" className="text-xs text-cyan-400 hover:underline">
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
                    className="flex items-center gap-2 rounded-lg border border-slate-800 px-2.5 py-1.5 transition hover:border-cyan-500/40"
                  >
                    <span className="flex-1 truncate text-xs text-slate-200">
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
                          ? "bg-red-500/15 text-red-300"
                          : days >= 2
                            ? "bg-amber-500/15 text-amber-300"
                            : "bg-slate-800 text-slate-400"
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

      {/* 🚀 נכנס לעבודה — רוחב מלא */}
      <EngagementsPanel />
    </>
  );
}
