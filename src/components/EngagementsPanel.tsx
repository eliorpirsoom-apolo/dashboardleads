"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/fetcher";
import { Card, Chip, Button, Input } from "@/components/ui";
import { Icon } from "@/components/Icon";

interface ETask {
  id: string;
  title: string;
  done: boolean;
  assignee: { id: string; name: string } | null;
}
interface Engagement {
  id: string;
  title: string;
  kickoffAt: string | null;
  kickoffDone: boolean;
  status: string;
  client: { id: string; name: string };
  tasks: ETask[];
}
interface AdminUser {
  id: string;
  name: string;
}

function ymd(iso: string | null): string {
  return iso ? new Date(iso).toISOString().slice(0, 10) : "";
}

// "נכנס לעבודה" — לקוחות שאישרו הצעה, עם ישיבת התנעה וצ'ק-ליסט אונבורדינג.
export default function EngagementsPanel() {
  const [rows, setRows] = useState<Engagement[]>([]);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [newTask, setNewTask] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    const d = await api<{ engagements: Engagement[] }>("/api/engagements?status=active");
    setRows(d.engagements);
  }, []);

  useEffect(() => {
    load();
    api<{ users: AdminUser[] }>("/api/admin-users")
      .then((d) => setUsers(d.users))
      .catch(() => {});
  }, [load]);

  async function patchEngagement(id: string, data: Record<string, unknown>) {
    await api(`/api/engagements/${id}`, { method: "PATCH", json: data });
    load();
  }
  async function patchTask(id: string, data: Record<string, unknown>) {
    await api(`/api/engagement-tasks/${id}`, { method: "PATCH", json: data });
    load();
  }
  async function addTask(engagementId: string) {
    const title = (newTask[engagementId] ?? "").trim();
    if (!title) return;
    await api(`/api/engagements/${engagementId}/tasks`, { method: "POST", json: { title } });
    setNewTask((p) => ({ ...p, [engagementId]: "" }));
    load();
  }
  async function deleteTask(id: string) {
    if (!confirm("למחוק את המשימה?")) return;
    await api(`/api/engagement-tasks/${id}`, { method: "DELETE" });
    load();
  }
  async function deleteEngagement(id: string, name: string) {
    if (
      !confirm(
        `לבטל את הכניסה-לעבודה של "${name}"?\n\nכל משימות האונבורדינג יימחקו, וההצעה תחזור לסטטוס "נשלחה" (ביטול אישור שנעשה בטעות). תמיד אפשר לאשר אותה שוב מאוחר יותר.`
      )
    )
      return;
    await api(`/api/engagements/${id}`, { method: "DELETE", json: { revertQuote: true } });
    load();
  }

  if (rows.length === 0) {
    return (
      <Card className="mt-4">
        <h2 className="mb-1 text-base font-bold text-slate-800">🚀 נכנס לעבודה</h2>
        <p className="py-4 text-center text-sm text-slate-600">
          אין לקוחות בקליטה כרגע. הצעה שתאושר ב&quot;הצעות מחיר&quot; תיפתח כאן אוטומטית.
        </p>
      </Card>
    );
  }

  return (
    <Card className="mt-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-base font-bold text-slate-800">🚀 נכנס לעבודה</h2>
        <Chip color="#34d399">{rows.length}</Chip>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[820px] text-right text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-xs text-slate-500">
              <th className="px-3 py-2 font-medium">לקוח</th>
              <th className="px-3 py-2 font-medium">ישיבת התנעה</th>
              <th className="px-3 py-2 font-medium">בוצעה?</th>
              <th className="px-3 py-2 font-medium">משימות אונבורדינג · מבצע · בוצע</th>
              <th className="px-3 py-2 font-medium">גאנט</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((e) => {
              const doneCount = e.tasks.filter((t) => t.done).length;
              return (
                <tr key={e.id} className="border-b border-slate-200/60 align-top">
                  <td className="px-3 py-3">
                    <Link
                      href={`/admin/clients/${e.client.id}`}
                      className="font-bold text-slate-800 hover:text-cyan-700"
                    >
                      {e.client.name}
                    </Link>
                    <p className="mt-0.5 max-w-[160px] truncate text-[11px] text-slate-500" title={e.title}>
                      {e.title}
                    </p>
                    <div className="mt-1 flex gap-2">
                      <button
                        onClick={() => patchEngagement(e.id, { status: "done" })}
                        className="text-[10px] text-slate-600 hover:text-emerald-400"
                      >
                        סיום ליווי ✓
                      </button>
                      <button
                        onClick={() => deleteEngagement(e.id, e.client.name)}
                        className="text-[10px] text-slate-600 hover:text-rose-500"
                        title="ביטול אישור שגוי — מוחק את הכניסה-לעבודה ומחזיר את ההצעה ל'נשלחה'"
                      >
                        בטל ומחק
                      </button>
                    </div>
                  </td>
                  <td className="px-3 py-3">
                    <Input
                      type="date"
                      dir="ltr"
                      value={ymd(e.kickoffAt)}
                      onChange={(ev) => patchEngagement(e.id, { kickoffAt: ev.target.value || null })}
                      className="!w-36 !py-1 text-xs"
                    />
                  </td>
                  <td className="px-3 py-3">
                    <button
                      onClick={() => patchEngagement(e.id, { kickoffDone: !e.kickoffDone })}
                      className={`rounded-full px-2 py-0.5 text-xs font-bold ${
                        e.kickoffDone
                          ? "bg-emerald-500/15 text-emerald-700"
                          : "bg-slate-100 text-slate-400"
                      }`}
                    >
                      {e.kickoffDone ? "בוצעה ✓" : "טרם"}
                    </button>
                  </td>
                  <td className="px-3 py-3">
                    <div className="mb-1 text-[10px] text-slate-500">
                      {doneCount}/{e.tasks.length} הושלמו
                    </div>
                    <div className="flex flex-col gap-1">
                      {e.tasks.map((t) => (
                        <div key={t.id} className="flex items-center gap-2">
                          <button
                            onClick={() => patchTask(t.id, { done: !t.done })}
                            className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border text-[10px] ${
                              t.done
                                ? "border-emerald-500 bg-emerald-500/20 text-emerald-700"
                                : "border-slate-600 text-transparent"
                            }`}
                          >
                            ✓
                          </button>
                          <span className={`text-xs ${t.done ? "text-slate-500 line-through" : "text-slate-700"}`}>
                            {t.title}
                          </span>
                          <select
                            value={t.assignee?.id ?? ""}
                            onChange={(ev) => patchTask(t.id, { assigneeId: ev.target.value || null })}
                            className="mr-auto rounded border border-slate-300 bg-white px-1 py-0.5 text-[10px] text-slate-600"
                          >
                            <option value="">— מבצע —</option>
                            {users.map((u) => (
                              <option key={u.id} value={u.id}>
                                {u.name}
                              </option>
                            ))}
                          </select>
                          <button
                            onClick={() => deleteTask(t.id)}
                            title="מחק משימה"
                            className="shrink-0 text-slate-600 hover:text-rose-400"
                          >
                            <Icon name="trash" className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                    <div className="mt-1.5 flex gap-1">
                      <Input
                        value={newTask[e.id] ?? ""}
                        onChange={(ev) => setNewTask((p) => ({ ...p, [e.id]: ev.target.value }))}
                        onKeyDown={(ev) => ev.key === "Enter" && (ev.preventDefault(), addTask(e.id))}
                        placeholder="+ משימה"
                        className="!w-40 !py-1 text-xs"
                      />
                    </div>
                  </td>
                  <td className="px-3 py-3">
                    <Link
                      href={`/admin/clients/${e.client.id}/gantt`}
                      className="text-xs text-cyan-400 hover:underline"
                    >
                      גאנט ←
                    </Link>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
