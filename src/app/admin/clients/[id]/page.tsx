import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { StatCard, Card, Chip } from "@/components/ui";
import { formatDateTime, formatCurrency } from "@/lib/format";

export const dynamic = "force-dynamic";

// Client overview tab (admin view): KPIs + latest activity.
export default async function ClientOverview({
  params,
}: {
  params: { id: string };
}) {
  const client = await prisma.client.findUnique({ where: { id: params.id } });
  if (!client) notFound();

  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const monthKey = new Date().toISOString().slice(0, 7);

  const [leadsWeek, leadsTotal, openTasks, wonThisMonth, budgets, statusDist, latest] =
    await Promise.all([
      prisma.lead.count({
        where: { clientId: client.id, receivedAt: { gte: weekAgo }, archived: false },
      }),
      prisma.lead.count({ where: { clientId: client.id, archived: false } }),
      prisma.task.count({ where: { clientId: client.id, status: "open" } }),
      prisma.lead.count({
        where: {
          clientId: client.id,
          archived: false,
          status: { systemKind: "won" },
          receivedAt: { gte: new Date(`${monthKey}-01`) },
        },
      }),
      prisma.budget.findMany({
        where: { clientId: client.id, periodKey: monthKey },
      }),
      prisma.leadStatus.findMany({
        where: { clientId: client.id },
        orderBy: { order: "asc" },
        include: { _count: { select: { leads: { where: { archived: false } } } } },
      }),
      prisma.lead.findMany({
        where: { clientId: client.id, archived: false },
        orderBy: { receivedAt: "desc" },
        take: 6,
        include: { status: { select: { name: true, color: true } } },
      }),
    ]);

  const monthBudget = budgets.reduce((s, b) => s + b.amount, 0);
  const monthSpend = budgets.reduce((s, b) => s + b.spend, 0);
  const monthLeads = await prisma.lead.count({
    where: {
      clientId: client.id,
      archived: false,
      receivedAt: { gte: new Date(`${monthKey}-01`) },
    },
  });
  const cpl = monthLeads > 0 && monthSpend > 0 ? monthSpend / monthLeads : null;

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="לידים השבוע" value={leadsWeek} icon="leads" />
        <StatCard label='סה"כ לידים' value={leadsTotal} icon="chart" />
        <StatCard label="עסקאות החודש" value={wonThisMonth} icon="money" />
        <StatCard
          label="עלות לליד (החודש)"
          value={cpl ? formatCurrency(cpl) : "—"}
          sub={monthBudget ? `תקציב: ${formatCurrency(monthBudget)} · הוצאה: ${formatCurrency(monthSpend)}` : "לא הוגדר תקציב"}
          icon="money"
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <h3 className="mb-3 text-base font-bold text-slate-100">התפלגות סטטוסים</h3>
          <div className="flex flex-col gap-2">
            {statusDist.map((s) => {
              const max = Math.max(...statusDist.map((x) => x._count.leads), 1);
              return (
                <div key={s.id} className="flex items-center gap-3">
                  <span className="w-28 truncate text-xs text-slate-400">{s.name}</span>
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-800">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${(s._count.leads / max) * 100}%`,
                        backgroundColor: s.color,
                      }}
                    />
                  </div>
                  <span className="w-8 text-left text-xs font-bold text-slate-300">
                    {s._count.leads}
                  </span>
                </div>
              );
            })}
          </div>
        </Card>

        <Card>
          <h3 className="mb-3 text-base font-bold text-slate-100">לידים אחרונים</h3>
          {latest.length === 0 ? (
            <p className="py-4 text-center text-sm text-slate-600">אין לידים עדיין</p>
          ) : (
            <div className="flex flex-col gap-2">
              {latest.map((l) => (
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

      {openTasks > 0 ? (
        <p className="text-xs text-slate-500">
          🔔 {openTasks} משימות פתוחות ללקוח הזה — ראו טאב &quot;משימות&quot;.
        </p>
      ) : null}
    </div>
  );
}
