"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/fetcher";
import { formatCurrency } from "@/lib/format";
import { Button, Card, Chip, EmptyState, Field, Input, Select, Textarea } from "@/components/ui";
import { Icon } from "@/components/Icon";
import Modal from "@/components/Modal";
import { fireConfetti } from "@/lib/confetti";

// מעקב הצעות מחיר של המשרד: כל הצעה חיה עד שנסגרת (אושרה/נדחתה).
// כל עדכון מאפס את שעון ה"ימים ללא מענה".

export const QUOTE_STATUSES: Record<string, { label: string; color: string }> = {
  sent: { label: "נשלחה", color: "#38bdf8" },
  followup: { label: "במעקב", color: "#f59e0b" },
  won: { label: "אושרה", color: "#34d399" },
  lost: { label: "נדחתה", color: "#f87171" },
};

interface QuoteRow {
  id: string;
  recipient: string;
  title: string;
  amount: number | null;
  approvedRetainer: number | null;
  approvedOneoff: number | null;
  status: string;
  sentAt: string;
  updatedAt: string;
  notes: string | null;
  fileName: string | null;
  fileKey: string | null;
  client: { id: string; name: string } | null;
}

function fmtDate(iso: string): string {
  return new Intl.DateTimeFormat("he-IL", {
    timeZone: "Asia/Jerusalem",
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
  }).format(new Date(iso));
}

export function daysStale(q: { updatedAt: string }): number {
  return Math.floor((Date.now() - new Date(q.updatedAt).getTime()) / 86_400_000);
}

export default function QuotesView() {
  const [quotes, setQuotes] = useState<QuoteRow[]>([]);
  const [filter, setFilter] = useState<"open" | "won" | "lost" | "all">("open");
  const [showCreate, setShowCreate] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const d = await api<{ quotes: QuoteRow[] }>(`/api/quotes?status=${filter}`);
      setQuotes(d.quotes);
    } catch (e: any) {
      setError(e.message);
    }
  }, [filter]);

  useEffect(() => {
    load();
  }, [load]);

  const [approving, setApproving] = useState<QuoteRow | null>(null);

  async function setStatus(q: QuoteRow, status: string) {
    // אישור הצעה = פתיחת לקוח + כניסה לעבודה → דרך דיאלוג ייעודי.
    if (status === "won") {
      setApproving(q);
      return;
    }
    try {
      await api(`/api/quotes/${q.id}`, { method: "PATCH", json: { status } });
      load();
    } catch (e: any) {
      alert(e.message);
    }
  }

  async function remove(q: QuoteRow) {
    if (!confirm(`למחוק את ההצעה ל"${q.recipient}"?`)) return;
    await api(`/api/quotes/${q.id}`, { method: "DELETE" });
    load();
  }

  const FILTERS: { key: typeof filter; label: string }[] = [
    { key: "open", label: "פתוחות" },
    { key: "won", label: "אושרו" },
    { key: "lost", label: "נדחו" },
    { key: "all", label: "הכול" },
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`rounded-full border px-3 py-1 text-xs transition ${
              filter === f.key
                ? "border-cyan-500/60 bg-cyan-500/15 font-semibold text-cyan-700"
                : "border-slate-200 text-slate-400 hover:text-slate-700"
            }`}
          >
            {f.label}
          </button>
        ))}
        <span className="flex-1" />
        <Button onClick={() => setShowCreate(true)}>
          <Icon name="plus" className="h-4 w-4" />
          הצעת מחיר חדשה
        </Button>
      </div>

      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      {quotes.length === 0 ? (
        <div className="glass rounded-2xl p-2">
          <EmptyState
            icon="money"
            title={filter === "open" ? "אין הצעות מחיר פתוחות" : "אין הצעות מחיר"}
            hint="כל הצעה שהמשרד מוציא נרשמת כאן ונשארת במעקב עד שהיא נסגרת."
            action={
              <Button onClick={() => setShowCreate(true)}>
                <Icon name="plus" className="h-4 w-4" />
                רישום הצעה ראשונה
              </Button>
            }
          />
        </div>
      ) : (
        <Card className="overflow-x-auto p-0">
          <table className="w-full min-w-[760px] text-right text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-xs text-slate-500">
                <th className="px-4 py-3 font-medium">נמען</th>
                <th className="px-4 py-3 font-medium">נושא</th>
                <th className="px-4 py-3 font-medium">לקוח</th>
                <th className="px-4 py-3 font-medium">סכום</th>
                <th className="px-4 py-3 font-medium">נשלחה</th>
                <th className="px-4 py-3 font-medium">ללא מענה</th>
                <th className="px-4 py-3 font-medium">סטטוס</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {quotes.map((q) => {
                const days = daysStale(q);
                const open = q.status === "sent" || q.status === "followup";
                return (
                  <tr key={q.id} className="border-b border-slate-200/60 hover:bg-slate-100/40">
                    <td className="px-4 py-2.5 font-medium text-slate-700">
                      {q.recipient}
                      {q.notes ? (
                        <p className="mt-0.5 max-w-[240px] truncate text-[11px] text-slate-500" title={q.notes}>
                          {q.notes}
                        </p>
                      ) : null}
                    </td>
                    <td className="px-4 py-2.5 text-slate-600">{q.title}</td>
                    <td className="px-4 py-2.5 text-xs text-slate-400">{q.client?.name ?? "—"}</td>
                    <td className="px-4 py-2.5 text-slate-600" onClick={(e) => e.stopPropagation()}>
                      {open ? (
                        // מחיר ניתן לעריכה כל עוד ההצעה פתוחה (המחיר משתנה במו"מ).
                        <input
                          type="number"
                          dir="ltr"
                          defaultValue={q.amount ?? ""}
                          onBlur={async (e) => {
                            const v = e.target.value === "" ? null : Number(e.target.value);
                            if (v === q.amount) return;
                            try {
                              await api(`/api/quotes/${q.id}`, { method: "PATCH", json: { amount: v } });
                              load();
                            } catch (err: any) {
                              alert(err.message);
                            }
                          }}
                          className="w-24 rounded-lg border border-slate-200 bg-transparent px-2 py-1 text-sm text-slate-700 focus:border-[#3a5bd9] focus:outline-none"
                          title="המחיר בהצעה — לחיצה לעריכה"
                        />
                      ) : (
                        <span>
                          {q.amount ? formatCurrency(q.amount) : "—"}
                          {q.approvedRetainer || q.approvedOneoff ? (
                            <span className="mt-0.5 block text-[10px] text-emerald-600">
                              בפועל: {q.approvedRetainer ? `ריטיינר ${formatCurrency(q.approvedRetainer)}` : ""}
                              {q.approvedRetainer && q.approvedOneoff ? " + " : ""}
                              {q.approvedOneoff ? `חד״פ ${formatCurrency(q.approvedOneoff)}` : ""}
                            </span>
                          ) : null}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-xs text-slate-400">{fmtDate(q.sentAt)}</td>
                    <td className="px-4 py-2.5">
                      {open ? (
                        <span
                          className={`rounded-full px-2 py-0.5 text-xs font-bold ${
                            days >= 4
                              ? "bg-red-500/15 text-red-600"
                              : days >= 2
                                ? "bg-amber-500/15 text-amber-700"
                                : "bg-slate-100 text-slate-400"
                          }`}
                        >
                          {days === 0 ? "היום" : `${days} ימים`}
                        </span>
                      ) : (
                        <span className="text-xs text-slate-600">—</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5">
                      <Select
                        value={q.status}
                        onChange={(e) => setStatus(q, e.target.value)}
                        className="!w-28"
                      >
                        {Object.entries(QUOTE_STATUSES).map(([k, s]) => (
                          <option key={k} value={k}>
                            {s.label}
                          </option>
                        ))}
                      </Select>
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-1">
                        {q.fileKey ? (
                          <a
                            href={`/api/quotes/${q.id}/file`}
                            target="_blank"
                            rel="noreferrer"
                            title={q.fileName ?? "קובץ ההצעה"}
                            className="rounded p-1.5 text-slate-500 hover:text-cyan-700"
                          >
                            <Icon name="folder" className="h-4 w-4" />
                          </a>
                        ) : null}
                        <button
                          onClick={() => remove(q)}
                          title="מחיקה"
                          className="rounded p-1.5 text-slate-600 hover:text-red-600"
                        >
                          <Icon name="trash" className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      )}

      {showCreate ? (
        <CreateQuoteModal
          onClose={() => setShowCreate(false)}
          onCreated={() => {
            setShowCreate(false);
            setFilter("open");
            load();
          }}
        />
      ) : null}

      {approving ? (
        <ApproveQuoteModal
          quote={approving}
          onClose={() => setApproving(null)}
          onApproved={() => {
            setApproving(null);
            fireConfetti(); // 🎉 נכנס לעבודה!
            load();
          }}
        />
      ) : null}
    </div>
  );
}

function ApproveQuoteModal({
  quote,
  onClose,
  onApproved,
}: {
  quote: QuoteRow;
  onClose: () => void;
  onApproved: () => void;
}) {
  // ברירת מחדל: אם ההצעה כבר משויכת ללקוח — "קיים"; אחרת "חדש".
  const [mode, setMode] = useState<"existing" | "new">(quote.client ? "existing" : "new");
  const [clientId, setClientId] = useState(quote.client?.id ?? "");
  const [clients, setClients] = useState<{ id: string; name: string }[]>([]);
  const [company, setCompany] = useState(quote.recipient);
  const [contactName, setContactName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  // המחיר בפועל כשנחתם — מפוצל ריטיינר/חד-פעמי (נרשם גם בלוח התשלומים).
  const [actualRetainer, setActualRetainer] = useState(
    quote.approvedRetainer != null ? String(quote.approvedRetainer) : ""
  );
  const [actualOneoff, setActualOneoff] = useState(
    quote.approvedOneoff != null ? String(quote.approvedOneoff) : ""
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    api<{ clients: { id: string; name: string }[] }>("/api/clients")
      .then((d) => setClients(d.clients))
      .catch(() => {});
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (mode === "existing" && !clientId) {
      setError("בחרו לקוח קיים או עברו ל'לקוח חדש'");
      return;
    }
    setBusy(true);
    try {
      const prices = {
        approvedRetainer: actualRetainer === "" ? null : Number(actualRetainer),
        approvedOneoff: actualOneoff === "" ? null : Number(actualOneoff),
      };
      await api(`/api/quotes/${quote.id}/approve`, {
        method: "POST",
        json:
          mode === "existing"
            ? { clientId, ...prices }
            : {
                company,
                contactName: contactName || null,
                phone: phone || null,
                email: email || null,
                ...prices,
              },
      });
      onApproved();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title="אישור הצעה — כניסה לעבודה" onClose={onClose}>
      <form onSubmit={submit} className="flex flex-col gap-3">
        {error ? <p className="text-sm text-red-600">{error}</p> : null}

        {/* בחירה: לקוח קיים או חדש */}
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setMode("existing")}
            className={`flex-1 rounded-xl border px-3 py-2 text-sm transition ${
              mode === "existing"
                ? "border-cyan-500/60 bg-cyan-500/15 font-semibold text-cyan-700"
                : "border-slate-200 text-slate-400"
            }`}
          >
            לקוח קיים
          </button>
          <button
            type="button"
            onClick={() => setMode("new")}
            className={`flex-1 rounded-xl border px-3 py-2 text-sm transition ${
              mode === "new"
                ? "border-cyan-500/60 bg-cyan-500/15 font-semibold text-cyan-700"
                : "border-slate-200 text-slate-400"
            }`}
          >
            לקוח חדש
          </button>
        </div>

        {mode === "existing" ? (
          <Field label="בחירת לקוח">
            <Select value={clientId} onChange={(e) => setClientId(e.target.value)}>
              <option value="">— בחרו לקוח —</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </Field>
        ) : (
          <>
            <p className="text-sm text-slate-400">
              ייפתח לקוח חדש + משתמש (כניסה עם Google) וייכנס לעבודה עם צ&apos;ק-ליסט.
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="שם החברה">
                <Input value={company} onChange={(e) => setCompany(e.target.value)} required={mode === "new"} />
              </Field>
              <Field label="איש קשר">
                <Input value={contactName} onChange={(e) => setContactName(e.target.value)} />
              </Field>
              <Field label="טלפון">
                <Input dir="ltr" value={phone} onChange={(e) => setPhone(e.target.value)} />
              </Field>
              <Field label="אימייל (לכניסה עם Google)">
                <Input dir="ltr" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
              </Field>
            </div>
          </>
        )}

        {/* 💰 המחיר בפועל — מה שנחתם (לרוב שונה מההצעה). נרשם גם בלוח התשלומים. */}
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3">
          <p className="mb-2 text-xs font-bold text-emerald-700">
            💰 המחיר בפועל שנחתם{quote.amount ? ` (בהצעה: ${formatCurrency(quote.amount)})` : ""}
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="ריטיינר חודשי (₪)">
              <Input
                type="number"
                dir="ltr"
                min={0}
                value={actualRetainer}
                onChange={(e) => setActualRetainer(e.target.value)}
                placeholder="0"
              />
            </Field>
            <Field label="חד-פעמי (₪)">
              <Input
                type="number"
                dir="ltr"
                min={0}
                value={actualOneoff}
                onChange={(e) => setActualOneoff(e.target.value)}
                placeholder="0"
              />
            </Field>
          </div>
          <p className="mt-1.5 text-[11px] text-emerald-600">
            הסכומים יירשמו אוטומטית בלוח התשלומים של הלקוח לחודש הנוכחי.
          </p>
        </div>

        <div className="mt-1 flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>ביטול</Button>
          <Button type="submit" disabled={busy}>{busy ? "פותח…" : "אישור וכניסה לעבודה"}</Button>
        </div>
      </form>
    </Modal>
  );
}

function CreateQuoteModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: () => void;
}) {
  const [recipient, setRecipient] = useState("");
  const [title, setTitle] = useState("");
  const [amount, setAmount] = useState("");
  const [clientId, setClientId] = useState("");
  const [sentAt, setSentAt] = useState(() =>
    new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jerusalem" }).format(new Date())
  );
  const [notes, setNotes] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [clients, setClients] = useState<{ id: string; name: string }[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    api<{ clients: { id: string; name: string }[] }>("/api/clients")
      .then((d) => setClients(d.clients))
      .catch(() => {});
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      let fileMeta: Record<string, string> = {};
      if (file) {
        const fd = new FormData();
        fd.append("file", file);
        fd.append("category", "quote");
        const up = await fetch("/api/uploads/direct", { method: "POST", body: fd });
        if (!up.ok) {
          const err = await up.json().catch(() => ({}));
          throw new Error(err.error || "העלאת הקובץ נכשלה");
        }
        const { key } = await up.json();
        fileMeta = {
          fileKey: key,
          fileName: file.name,
          mimeType: file.type || "application/octet-stream",
        };
      }

      await api("/api/quotes", {
        method: "POST",
        json: {
          recipient,
          title,
          amount: amount ? Number(amount) : null,
          clientId: clientId || null,
          sentAt,
          notes: notes || null,
          ...fileMeta,
        },
      });
      onCreated();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title="הצעת מחיר חדשה" onClose={onClose}>
      <form onSubmit={submit} className="flex flex-col gap-3">
        {error ? <p className="text-sm text-red-600">{error}</p> : null}

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="נמען (שם העסק / איש הקשר)">
            <Input value={recipient} onChange={(e) => setRecipient(e.target.value)} required />
          </Field>
          <Field label="נושא ההצעה">
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder='למשל: "ניהול קמפיינים חודשי"' required />
          </Field>
          <Field label="סכום (₪, אופציונלי)">
            <Input type="number" min="0" dir="ltr" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </Field>
          <Field label="לקוח קיים (אופציונלי)">
            <Select value={clientId} onChange={(e) => setClientId(e.target.value)}>
              <option value="">— מתעניין חדש —</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="תאריך שליחה">
            <Input type="date" dir="ltr" value={sentAt} onChange={(e) => setSentAt(e.target.value)} required />
          </Field>
          <Field label="קובץ ההצעה (PDF, אופציונלי)">
            <Input type="file" accept=".pdf,.doc,.docx" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          </Field>
        </div>
        <Field label="הערות">
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
        </Field>

        <div className="mt-1 flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>ביטול</Button>
          <Button type="submit" disabled={busy}>{busy ? "שומר…" : "רישום ההצעה"}</Button>
        </div>
      </form>
    </Modal>
  );
}
