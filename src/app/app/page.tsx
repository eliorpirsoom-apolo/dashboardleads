import Link from "next/link";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PageHeader, StatCard, Card, Chip } from "@/components/ui";
import { Icon } from "@/components/Icon";
import { formatTime, formatDateTime, formatCurrency } from "@/lib/format";
import { ilDayStart, ilDayEnd, ilMonthKey, ilMonthStart } from "@/lib/time";
import { leadTrend } from "@/lib/trend";
import TrendChart from "@/components/TrendChart";
import OnboardingChecklist from "@/components/OnboardingChecklist";
import { allowedProjectIds, leadProjectWhere } from "@/lib/projectScope";
import { ilGreeting } from "@/lib/greeting";

export const dynamic = "force-dynamic";

// Client home — the client understands their activity in 30 seconds.
export default async function ClientDashboard() {
  const user = (await getSession())!;
  const clientId = user.clientId!;

  const now = new Date();
  const dayStart = ilDayStart(now);
  const dayEnd = ilDayEnd(now);
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const monthKey = ilMonthKey(now);
  const monthStart = ilMonthStart(now);

  // סוכן המשויך לפרויקטים רואה רק את המספרים של הפרויקטים שלו.
  const allowed = await allowedProjectIds(user);
  const projScope = leadProjectWhere(allowed);

  const [leadsToday, leadsWeek, leadsMonth, wonMonth, budgets, todayTasks, recentLeads, statusDist] =
    await Promise.all([
      prisma.lead.count({ where: { clientId, archived: false, ...projScope, receivedAt: { gte: dayStart } } }),
      prisma.lead.count({ where: { clientId, archived: false, ...projScope, receivedAt: { gte: weekAgo } } }),
      prisma.lead.count({ where: { clientId, archived: false, ...projScope, receivedAt: { gte: monthStart } } }),
      prisma.lead.count({
        where: { clientId, archived: false, ...projScope, status: { systemKind: "won" }, receivedAt: { gte: monthStart } },
      }),
      prisma.budget.findMany({ where: { clientId, periodKey: monthKey } }),
      prisma.task.findMany({
        where: {
          clientId,
          ownerSide: "client",
          status: "open",
          dueAt: { gte: dayStart, lt: dayEnd },
          ...(allowed
            ? { OR: [{ assigneeId: user.id }, { lead: { projectId: { in: allowed } } }] }
            : {}),
        },
        orderBy: { dueAt: "asc" },
        take: 8,
        include: { lead: { select: { fullName: true, number: true } } },
      }),
      prisma.lead.findMany({
        where: { clientId, archived: false, ...projScope },
        orderBy: { receivedAt: "desc" },
        take: 6,
        include: { status: { select: { name: true, color: true } } },
      }),
      prisma.leadStatus.findMany({
        where: { clientId },
        orderBy: { order: "asc" },
        include: { _count: { select: { leads: { where: { archived: false, ...projScope, receivedAt: { gte: monthStart } } } } } },
      }),
    ]);

  const monthSpend = budgets.reduce((s, b) => s + b.spend, 0);
  const cpl = leadsMonth > 0 && monthSpend > 0 ? monthSpend / leadsMonth : null;

  // Trend + onboarding signals
  const [trend, totalLeads, sourcesCount, agentsCount] = await Promise.all([
    leadTrend(clientId, 30, allowed),
    prisma.lead.count({ where: { clientId, ...projScope } }),
    prisma.leadSource.count({ where: { clientId, active: true } }),
    prisma.user.count({ where: { clientId, isAgent: true, active: true } }),
  ]);

  // 🎯 העבודה שלי עכשיו: לידים חדשים בלי מענה + חזרות שמועדן עבר.
  const agentTaskScope = allowed
    ? { OR: [{ assigneeId: user.id }, { lead: { projectId: { in: allowed } } }] }
    : {};
  const [unhandledLeads, overdueTasks] = await Promise.all([
    prisma.lead.findMany({
      where: { clientId, archived: false, ...projScope, firstHandledAt: null },
      orderBy: { receivedAt: "asc" },
      take: 6,
      select: { id: true, number: true, fullName: true, phone: true, receivedAt: true },
    }),
    prisma.task.findMany({
      where: {
        clientId,
        ownerSide: "client",
        status: { in: ["open", "in_progress"] },
        dueAt: { lt: dayStart },
        ...agentTaskScope,
      },
      orderBy: { dueAt: "asc" },
      take: 6,
      include: { lead: { select: { number: true, fullName: true } } },
    }),
  ]);
  const waitingLabel = (iso: Date) => {
    const min = Math.floor((now.getTime() - iso.getTime()) / 60_000);
    return min < 60 ? `${min} דק׳` : min < 1440 ? `${Math.floor(min / 60)} שע׳` : `${Math.floor(min / 1440)} ימים`;
  };

  return (
    <>
      <PageHeader
        title={`${ilGreeting()}, ${user.name.split(" ")[0]}`}
        subtitle="תמונת מצב הפעילות הדיגיטלית שלך"
      />

      {totalLeads < 3 && !user.isAgent ? (
        <OnboardingChecklist
          hasSource={sourcesCount > 0}
          hasAgent={agentsCount > 0}
          hasLead={totalLeads > 0}
        />
      ) : null}

      {/* 🎯 העבודה שלי עכשיו — מה דורש טיפול ברגע זה */}
      {unhandledLeads.length > 0 || overdueTasks.length > 0 ? (
        <Card className="mb-4 border-amber-200 bg-amber-50/50">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-base font-bold text-slate-800">🎯 דורש טיפול עכשיו</h2>
            <Link href="/app/leads" className="text-xs font-medium text-[#3a5bd9] hover:underline">
              לכל הלידים ←
            </Link>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            {unhandledLeads.length > 0 ? (
              <div>
                <p className="mb-1.5 text-xs font-bold text-red-600">
                  ⏱ לידים חדשים בלי מענה ({unhandledLeads.length})
                </p>
                <div className="flex flex-col gap-1.5">
                  {unhandledLeads.map((l) => (
                    <Link
                      key={l.id}
                      href="/app/leads"
                      className="flex items-center gap-2 rounded-lg border border-red-200 bg-white px-2.5 py-1.5 text-xs transition hover:border-red-400"
                    >
                      <span className="flex-1 truncate font-medium text-slate-700">
                        {l.fullName ?? l.phone ?? `ליד #${l.number}`}
                      </span>
                      <span className="whitespace-nowrap rounded-full bg-red-500/10 px-2 py-0.5 text-[10px] font-bold text-red-600">
                        ממתין {waitingLabel(l.receivedAt)}
                      </span>
                    </Link>
                  ))}
                </div>
              </div>
            ) : null}
            {overdueTasks.length > 0 ? (
              <div>
                <p className="mb-1.5 text-xs font-bold text-amber-700">
                  🔴 חזרות ומשימות באיחור ({overdueTasks.length})
                </p>
                <div className="flex flex-col gap-1.5">
                  {overdueTasks.map((t) => (
                    <Link
                      key={t.id}
                      href="/app/tasks"
                      className="flex items-center gap-2 rounded-lg border border-amber-200 bg-white px-2.5 py-1.5 text-xs transition hover:border-amber-400"
                    >
                      <span className="flex-1 truncate text-slate-700">
                        {t.title}
                        {t.lead ? ` · #${t.lead.number}` : ""}
                      </span>
                      <span className="whitespace-nowrap text-[10px] text-amber-700">
                        {formatDateTime(t.dueAt)}
                      </span>
                    </Link>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        </Card>
      ) : null}

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
            <h2 className="text-base font-bold text-slate-800">היום שלי</h2>
            <Link href="/app/calendar" className="text-xs text-cyan-400 hover:underline">
              ללוח השנה ←
            </Link>
          </div>
          {todayTasks.length === 0 ? (
            <p className="py-6 text-center text-sm text-slate-600">אין משימות להיום 🎉</p>
          ) : (
            <div className="flex flex-col gap-2">
              {todayTasks.map((t) => (
                <div key={t.id} className="flex items-center gap-3 rounded-xl border border-slate-200 px-3 py-2">
                  <span className="font-mono text-xs text-slate-500">{formatTime(t.dueAt)}</span>
                  <Icon
                    name={t.type === "meeting" ? "calendar" : "tasks"}
                    className={`h-4 w-4 ${t.type === "meeting" ? "text-violet-400" : "text-cyan-400"}`}
                  />
                  <span className="flex-1 truncate text-sm text-slate-700">
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
            <h2 className="text-base font-bold text-slate-800">לידים אחרונים</h2>
            <Link href="/app/leads" className="text-xs text-cyan-400 hover:underline">
              לכל הלידים ←
            </Link>
          </div>
          {recentLeads.length === 0 ? (
            <p className="py-6 text-center text-sm text-slate-600">אין לידים עדיין</p>
          ) : (
            <div className="flex flex-col gap-2">
              {recentLeads.map((l) => (
                <div key={l.id} className="flex items-center gap-3 rounded-xl border border-slate-200 px-3 py-2">
                  <span className="font-mono text-xs text-slate-600">#{l.number}</span>
                  <span className="flex-1 truncate text-sm text-slate-700">
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
        <TrendChart data={trend} />
      </div>

      <div className="mt-4">
        <Card>
          <h2 className="mb-3 text-base font-bold text-slate-800">לידים החודש לפי סטטוס</h2>
          <div className="flex flex-col gap-2">
            {statusDist.map((s) => {
              const max = Math.max(...statusDist.map((x) => x._count.leads), 1);
              return (
                <div key={s.id} className="flex items-center gap-3">
                  <span className="w-28 truncate text-xs text-slate-400">{s.name}</span>
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100">
                    <div
                      className="h-full rounded-full"
                      style={{ width: `${(s._count.leads / max) * 100}%`, backgroundColor: s.color }}
                    />
                  </div>
                  <span className="w-8 text-left text-xs font-bold text-slate-600">{s._count.leads}</span>
                </div>
              );
            })}
          </div>
        </Card>
      </div>
    </>
  );
}
