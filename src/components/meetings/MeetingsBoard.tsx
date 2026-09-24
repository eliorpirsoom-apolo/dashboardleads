"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/fetcher";
import { formatDateTime } from "@/lib/format";
import { Button, Card, Field, Input, Select } from "@/components/ui";
import { Icon } from "@/components/Icon";
import Modal from "@/components/Modal";
import MeetingSummaryDrawer from "./MeetingSummaryDrawer";

interface Row {
  id: string;
  client: { id: string; name: string; color: string | null } | null;
  title: string;
  meetingDate: string;
  status: string;
  source: string;
  sentToClientAt: string | null;
  pointCount: number;
  taskCount: number;
}
interface ClientOpt { id: string; name: string }

const STATUS_META: Record<string, { label: string; cls: string }> = {
  draft: { label: "טיוטה", cls: "border-amber-200 bg-amber-50 text-amber-700" },
  approved: { label: "מאושר", cls: "border-sky-200 bg-sky-50 text-sky-700" },
  sent: { label: "נשלח ללקוח ✓", cls: "border-emerald-200 bg-emerald-50 text-emerald-700" },
};

export default function MeetingsBoard({ clients }: { clients: ClientOpt[] }) {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [clientFilter, setClientFilter] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const q = clientFilter ? `?clientId=${clientFilter}` : "";
    const d = await api<{ meetings: Row[] }>(`/api/meetings${q}`);
    setRows(d.meetings);
    setLoading(false);
  }, [clientFilter]);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={() => setShowCreate(true)}>
          <Icon name="plus" className="h-4 w-4" />
          סיכום חדש
        </Button>
        <div className="w-56">
          <Select value={clientFilter} onChange={(e) => setClientFilter(e.target.value)}>
            <option value="">כל הלקוחות</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </Select>
        </div>
        <span className="mr-auto text-xs text-slate-400">
          סיכום מגיע גם אוטומטית: שולחים לבוט הוואטסאפ צילום של דף הפגישה עם הכיתוב ״סיכום: שם הלקוח״.
        </span>
      </div>

      {loading ? (
        <p className="p-8 text-center text-sm text-slate-400">טוען…</p>
      ) : rows.length === 0 ? (
        <Card>
          <p className="py-10 text-center text-sm text-slate-500">
            אין סיכומי פגישות עדיין. צרו סיכום חדש, או שלחו צילום דף פגישה לבוט הוואטסאפ.
          </p>
        </Card>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
          <table className="w-full text-right text-sm">
            <thead className="bg-slate-50 text-xs text-slate-500">
              <tr>
                <th className="px-3 py-2 text-right">סיכום</th>
                <th className="px-3 py-2 text-right">לקוח</th>
                <th className="px-3 py-2 text-right">תאריך</th>
                <th className="px-3 py-2 text-right">נקודות</th>
                <th className="px-3 py-2 text-right">משימות</th>
                <th className="px-3 py-2 text-right">סטטוס</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const st = STATUS_META[r.status] ?? { label: r.status, cls: "border-slate-200 text-slate-500" };
                return (
                  <tr
                    key={r.id}
                    className="cursor-pointer border-t border-slate-100 hover:bg-slate-50"
                    onClick={() => setOpenId(r.id)}
                  >
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-1.5 font-medium text-slate-700">
                        {r.source === "whatsapp" ? <span title="נקלט מהבוט">💬</span> : null}
                        <span className="max-w-[360px] truncate">{r.title}</span>
                      </div>
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap text-slate-600">{r.client?.name ?? "—"}</td>
                    <td className="px-3 py-2 whitespace-nowrap text-xs text-slate-500">
                      {new Intl.DateTimeFormat("he-IL", { day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(r.meetingDate))}
                    </td>
                    <td className="px-3 py-2 text-slate-600">{r.pointCount}</td>
                    <td className="px-3 py-2 text-slate-600">{r.taskCount || "—"}</td>
                    <td className="px-3 py-2">
                      <span className={`rounded-full border px-2 py-0.5 text-xs ${st.cls}`}>{st.label}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {showCreate ? (
        <CreateMeetingModal
          clients={clients}
          onClose={() => setShowCreate(false)}
          onCreated={(id) => { setShowCreate(false); load(); setOpenId(id); }}
        />
      ) : null}

      {openId ? (
        <MeetingSummaryDrawer
          meetingId={openId}
          onClose={() => setOpenId(null)}
          onChanged={load}
        />
      ) : null}
    </div>
  );
}

function CreateMeetingModal({
  clients,
  onClose,
  onCreated,
}: {
  clients: ClientOpt[];
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const today = new Date().toISOString().slice(0, 10);
  const [clientId, setClientId] = useState("");
  const [date, setDate] = useState(today);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!clientId) { setError("בחרו לקוח"); return; }
    setBusy(true);
    setError("");
    try {
      // כל שורה בטקסט → נקודה. שורה שמתחילה ב-* / [ ] / "משימה:" תסומן כמשימה.
      const bullets = text
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean)
        .map((l) => {
          const isTask = /^(\*|\[\s?\]|משימה[:\-]|todo[:\-]?)/i.test(l);
          return { text: l.replace(/^(\*|\[\s?\]|משימה[:\-]|todo[:\-]?)\s*/i, "").trim(), isTask };
        })
        .filter((b) => b.text);
      const d = await api<{ meeting: { id: string } }>("/api/meetings", {
        method: "POST",
        json: { clientId, meetingDate: date, bullets },
      });
      onCreated(d.meeting.id);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title="סיכום פגישה חדש" onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        {error ? <p className="text-xs text-red-600">{error}</p> : null}
        <div className="grid grid-cols-2 gap-3">
          <Field label="לקוח">
            <Select value={clientId} onChange={(e) => setClientId(e.target.value)}>
              <option value="">— בחרו —</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </Select>
          </Field>
          <Field label="תאריך הפגישה">
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
        </div>
        <Field label="נקודות הפגישה (שורה לכל נקודה)" hint="שורה שמתחילה ב-* או ״משימה:״ תסומן אוטומטית כמשימה לביצוע">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={7}
            className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700"
            placeholder={"סוכם על קמפיין לחג\n* להכין 3 גרפיקות עד יום חמישי\nהלקוח אישר תקציב חודשי\n* לשלוח הצעת מחיר מעודכנת"}
          />
        </Field>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>ביטול</Button>
          <Button type="submit" disabled={busy}>{busy ? "יוצר…" : "צור סיכום"}</Button>
        </div>
      </form>
    </Modal>
  );
}
