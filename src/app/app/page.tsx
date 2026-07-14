import Link from "next/link";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PageHeader, StatCard, Card, Chip } from "@/components/ui";
import { Icon } from "@/components/Icon";
import { formatTime, formatDateTime, formatCurrency } from "@/lib/format";

export const dynamic = "force-dynamic";

// Client home — the client understands their activity in 30 seconds.
export default async function ClientDashboard() {
  const user = (await getSession())!;
  const clientId = user.clientId!;

  const now = new Date();
  const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const monthKey = now.toISOString().slice(0, 7);
  const monthStart = new Date(`${monthKey}-01`);

  const [leadsToday, leadsWeek, leadsMonth, wonMonth, budgets, todayTasks, recentLeads, statusDist] =
    await Promise.all([
      prisma.lead.count({ where: { clientId, archived: false, receivedAt: { gte: dayStart } } }),
      prisma.lead.count({ where: { clientId, archived: false, receivedAt: { gte: weekAgo } } }),
      prisma.lead.count({ where: { clientId, archived: false, receivedAt: { gte: monthStart } } }),
      prisma.lead.count({
        where: { clientId, archived: false, status: { systemKind: "won" }, receivedAt: { gte: monthStart } },
      }),
      prisma.budget.findMany({ where: { clientId, periodKey: monthKey } }),
      prisma.task.findMany({
        where: { clientId, ownerSide: "client", status: "open", dueAt: { gte: dayStart, lt: dayEnd } },
        orderBy: { dueAt: "asc" },
        take: 8,
        include: { lead: { select: { fullName: true, number: true } } },
      }),
      prisma.lead.findMany({
        where: { clientId, archived: false },
        orderBy: { receivedAt: "desc" },
        take: 6,
        include: { status: { select: { name: true, color: true } } },
      }),
      prisma.leadStatus.findMany({
        where: { clientId },
        orderBy: { order: "asc" },
        include: { _count: { select: { leads: { where: { archived: false, receivedAt: { gte: monthStart } } } } } },
      }),
    ]);

  const monthSpend = budgets.reduce((s, b) => s + b.spend, 0);
  const cpl = leadsMonth > 0 && monthSpend > 0 ? monthSpend / leadsMonth : null;

  return (
    <>
      <PageHeader
        title={`שלום, ${user.name.split(" ")[0]} 👋`}
        subtitle="תמונת מצב הפעילות הדיגיטלית שלך"
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="לידים היום" value={leadsToday} icon="leads" />
        <StatCard label="לידים ב-7 ימים" value={leadsWeek} icon="chart" />
        <StatCard label="עסקאות החודש" value={wonMonth} icon="money" />
        <StatCard
          label="עלות לליד (החודש)"
          value={cpl ? formatCurrency(cpl) : "—"}
          sub={monthSpend ? `הוצאה: ${formatCurrency(monthSpend)}` : undefined}
          icon="money"
        />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-base font-bold text-slate-100">היום שלי</h2>
            <Link href="/app/calendar" className="text-xs text-cyan-400 hover:underline">
              ללוח השנה ←
            </Link>
          </div>
          {todayTasks.length === 0 ? (
            <p className="py-6 text-center text-sm text-slate-600">אין משימות להיום 🎉</p>
          ) : (
            <div className="flex flex-col gap-2">
              {todayTasks.map((t) => (
                <div key={t.id} className="flex items-center gap-3 rounded-xl border border-slate-800 px-3 py-2">
                  <span className="font-mono text-xs text-slate-500">{formatTime(t.dueAt)}</span>
                  <Icon
                    name={t.type === "meeting" ? "calendar" : "tasks"}
                    className={`h-4 w-4 ${t.type === "meeting" ? "text-violet-400" : "text-cyan-400"}`}
                  />
                  <span className="flex-1 truncate text-sm text-slate-200">
                    {t.title}
                    {t.lead ? (
                      <span className="text-xs text-slate-500"> · ליד #{t.lead.number}</span>
                    ) : null}
                  </span>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-base font-bold text-slate-100">לידים אחרונים</h2>
            <Link href="/app/leads" className="text-xs text-cyan-400 hover:underline">
              לכל הלידים ←
            </Link>
          </div>
          {recentLeads.length === 0 ? (
            <p className="py-6 text-center text-sm text-slate-600">אין לידים עדיין</p>
          ) : (
            <div className="flex flex-col gap-2">
              {recentLeads.map((l) => (
                <div key={l.id} className="flex items-center gap-3 rounded-xl border border-slate-800 px-3 py-2">
                  <span className="font-mono text-xs text-slate-600">#{l.number}</span>
                  <span className="flex-1 truncate text-sm text-slate-200">
                    {l.fullName ?? l.phone ?? "—"}
                  </span>
                  <span className="text-[11px] text-slate-500">{formatDateTime(l.receivedAt)}</span>
                  {l.status ? <Chip color={l.status.color}>{l.status.name}</Chip> : null}
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      <div className="mt-4">
        <Card>
          <h2 className="mb-3 text-base font-bold text-slate-100">לידים החודש לפי סטטוס</h2>
          <div className="flex flex-col gap-2">
            {statusDist.map((s) => {
              const max = Math.max(...statusDist.map((x) => x._count.leads), 1);
              return (
                <div key={s.id} className="flex items-center gap-3">
                  <span className="w-28 truncate text-xs text-slate-400">{s.name}</span>
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-800">
                    <div
                      className="h-full rounded-full"
                      style={{ width: `${(s._count.leads / max) * 100}%`, backgroundColor: s.color }}
                    />
                  </div>
                  <span className="w-8 text-left text-xs font-bold text-slate-300">{s._count.leads}</span>
                </div>
              );
            })}
          </div>
        </Card>
      </div>
    </>
  );
}
