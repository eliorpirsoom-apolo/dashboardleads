import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { PageHeader, StatCard, Card, Chip } from "@/components/ui";
import { Icon } from "@/components/Icon";
import { formatTime } from "@/lib/format";
import { ilDayStart, ilDayEnd } from "@/lib/time";
import { ilGreeting } from "@/lib/greeting";

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
            <div className="flex flex-col gap-2">
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
    </>
  );
}
