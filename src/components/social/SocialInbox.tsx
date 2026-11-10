"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/fetcher";
import { formatDateTime } from "@/lib/format";
import { Button, Chip, EmptyState, Field, Select } from "@/components/ui";
import {
  STATUS_META as SHARED_STATUS_META,
  PLATFORM_META as SHARED_PLATFORM_META,
  KIND_META as SHARED_KIND_META,
} from "@/lib/social/constants";

// ---------------------------------------------------------------------------
// תיבת המענה החברתי — רשימת פניות + תצוגת שרשור. שלב 1a: קריאה בלבד (אין
// שליחה, אין טיוטות). מתרענן אוטומטית כל 15 שניות כדי שפנייה חדשה תופיע
// "תוך שניות" בלי לרענן את הדף.
// ---------------------------------------------------------------------------

const REFRESH_MS = 15_000;

interface ThreadRow {
  id: string;
  platform: string;
  kind: string;
  status: string;
  needsHuman: boolean;
  reason: string | null;
  authorName: string | null;
  authorExtId: string | null;
  snippet: string | null;
  permalink: string | null;
  lastInboundAt: string | null;
  lastMessageAt: string;
  createdAt: string;
  client: { id: string; name: string; color: string | null };
  account: { pageName: string; igUsername: string | null };
  _count: { messages: number };
}

interface MessageRow {
  id: string;
  direction: string;
  text: string;
  authorName: string | null;
  sentAt: string | null;
  createdAt: string;
}

interface ThreadDetail extends Omit<ThreadRow, "_count" | "snippet"> {
  externalId: string;
  postId: string | null;
  draftText: string | null;
  draftAt: string | null;
  account: { id: string; pageName: string; igUsername: string | null; pageId: string };
  messages: MessageRow[];
}

// הסטטוסים/פלטפורמות/סוגים — מקור יחיד משותף ל-API ול-UI (lib/social/constants).
const STATUS_META: Record<string, { label: string; color: string }> = SHARED_STATUS_META;
const PLATFORM_META: Record<string, { label: string; icon: string }> = SHARED_PLATFORM_META;
const KIND_META: Record<string, string> = SHARED_KIND_META;

function authorLabel(t: { authorName: string | null; authorExtId: string | null }): string {
  if (t.authorName) return t.authorName;
  if (t.authorExtId) return `משתמש #${t.authorExtId.slice(-6)}`;
  return "משתמש לא מזוהה";
}

export default function SocialInbox({ clients }: { clients: { id: string; name: string }[] }) {
  const [threads, setThreads] = useState<ThreadRow[]>([]);
  const [total, setTotal] = useState(0);
  const [openCount, setOpenCount] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [filters, setFilters] = useState({ clientId: "", platform: "", kind: "", status: "" });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<ThreadDetail | null>(null);
  const [error, setError] = useState("");
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);

  const loadList = useCallback(async () => {
    try {
      const p = new URLSearchParams({ page: String(page) });
      Object.entries(filters).forEach(([k, v]) => v && p.set(k, v));
      const d = await api<{ threads: ThreadRow[]; total: number; openCount: number; pageSize: number }>(
        `/api/social/threads?${p}`
      );
      setThreads(d.threads);
      setTotal(d.total);
      setOpenCount(d.openCount);
      setPageSize(d.pageSize);
      setLastRefresh(new Date());
      setError("");
    } catch (e: any) {
      setError(e.message);
    }
  }, [page, filters]);

  const loadDetail = useCallback(async (id: string) => {
    try {
      const d = await api<{ thread: ThreadDetail }>(`/api/social/threads/${id}`);
      setDetail(d.thread);
    } catch (e: any) {
      setError(e.message);
    }
  }, []);

  useEffect(() => {
    loadList();
  }, [loadList]);

  useEffect(() => {
    if (!selectedId) {
      setDetail(null);
      return;
    }
    loadDetail(selectedId);
  }, [selectedId, loadDetail]);

  // רענון אוטומטי — רק כשהטאב גלוי (לא מעמיסים על השרת מטאבים ברקע).
  useEffect(() => {
    const tick = () => {
      if (document.visibilityState !== "visible") return;
      loadList();
      if (selectedId) loadDetail(selectedId);
    };
    const t = setInterval(tick, REFRESH_MS);
    return () => clearInterval(t);
  }, [loadList, loadDetail, selectedId]);

  const setFilter = (key: keyof typeof filters, value: string) => {
    setFilters((f) => ({ ...f, [key]: value }));
    setPage(1);
  };

  return (
    <div className="flex flex-col gap-4">
      {/* סרגל סינון */}
      <div className="glass flex flex-wrap items-end gap-3 rounded-2xl p-4">
        <div className="w-44">
          <Field label="לקוח">
            <Select value={filters.clientId} onChange={(e) => setFilter("clientId", e.target.value)}>
              <option value="">כל הלקוחות</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </Select>
          </Field>
        </div>
        <div className="w-36">
          <Field label="פלטפורמה">
            <Select value={filters.platform} onChange={(e) => setFilter("platform", e.target.value)}>
              <option value="">הכול</option>
              {Object.entries(PLATFORM_META).map(([v, m]) => (
                <option key={v} value={v}>{m.icon} {m.label}</option>
              ))}
            </Select>
          </Field>
        </div>
        <div className="w-36">
          <Field label="סוג">
            <Select value={filters.kind} onChange={(e) => setFilter("kind", e.target.value)}>
              <option value="">הכול</option>
              {Object.entries(KIND_META).map(([v, l]) => (
                <option key={v} value={v}>{l}</option>
              ))}
            </Select>
          </Field>
        </div>
        <div className="w-40">
          <Field label="סטטוס">
            <Select value={filters.status} onChange={(e) => setFilter("status", e.target.value)}>
              <option value="">הכול</option>
              {Object.entries(STATUS_META).map(([v, m]) => (
                <option key={v} value={v}>{m.label}</option>
              ))}
            </Select>
          </Field>
        </div>
        <div className="mr-auto flex items-center gap-3 text-xs text-slate-500">
          <span>
            <span className="font-bold text-slate-700">{openCount}</span> פתוחות · {total} סה״כ
          </span>
          <Button variant="ghost" size="sm" onClick={loadList} title="רענון ידני (מתרענן אוטומטית כל 15 שניות)">
            ↻ {lastRefresh ? lastRefresh.toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit", second: "2-digit" }) : ""}
          </Button>
        </div>
      </div>

      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(320px,2fr)_3fr]">
        {/* רשימת הפניות */}
        <div className="glass flex flex-col divide-y divide-slate-200 rounded-2xl p-2">
          {threads.length === 0 ? (
            <EmptyState
              icon="mail"
              title="אין פניות"
              hint="תגובות והודעות חדשות מהדפים המחוברים יופיעו כאן תוך שניות"
            />
          ) : (
            threads.map((t) => {
              const sm = STATUS_META[t.status] ?? { label: t.status, color: "#64748b" };
              const pm = PLATFORM_META[t.platform] ?? { label: t.platform, icon: "💬" };
              const active = t.id === selectedId;
              return (
                <button
                  key={t.id}
                  onClick={() => setSelectedId(active ? null : t.id)}
                  className={`flex flex-col gap-1 rounded-xl px-3 py-2.5 text-right transition ${
                    active ? "bg-[#3a5bd9]/10" : "hover:bg-slate-100/40"
                  }`}
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-base" title={pm.label}>{pm.icon}</span>
                    <span className={`text-sm text-slate-800 ${t.status === "open" ? "font-bold" : "font-medium"}`}>
                      {authorLabel(t)}
                    </span>
                    <span className="text-[11px] text-slate-500">{KIND_META[t.kind] ?? t.kind}</span>
                    <Chip color={sm.color}>{sm.label}</Chip>
                    {t.needsHuman ? <Chip color="#f59e0b">⚠ דורש אדם</Chip> : null}
                    <span className="mr-auto text-[11px] text-slate-500">{formatDateTime(t.lastMessageAt)}</span>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="line-clamp-1 flex-1 text-xs text-slate-600">{t.snippet ?? ""}</span>
                    <Chip color={t.client.color ?? "#64748b"}>{t.client.name}</Chip>
                    <span className="text-[11px] text-slate-400">{t._count.messages} הודעות</span>
                  </div>
                </button>
              );
            })
          )}
          {total > pageSize ? (
            <div className="flex justify-center gap-2 pt-2">
              <Button variant="ghost" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>הקודם</Button>
              <span className="self-center text-xs text-slate-500">עמוד {page} מתוך {Math.ceil(total / pageSize)}</span>
              <Button variant="ghost" size="sm" disabled={page * pageSize >= total} onClick={() => setPage((p) => p + 1)}>הבא</Button>
            </div>
          ) : null}
        </div>

        {/* תצוגת שרשור */}
        <div className="glass rounded-2xl p-4">
          {!selectedId ? (
            <EmptyState icon="mail" title="בחרו פנייה מהרשימה" hint="השרשור המלא יוצג כאן" />
          ) : !detail ? (
            <p className="text-sm text-slate-500">טוען…</p>
          ) : (
            <ThreadView thread={detail} />
          )}
        </div>
      </div>
    </div>
  );
}

function ThreadView({ thread }: { thread: ThreadDetail }) {
  const sm = STATUS_META[thread.status] ?? { label: thread.status, color: "#64748b" };
  const pm = PLATFORM_META[thread.platform] ?? { label: thread.platform, icon: "💬" };
  const pageLabel =
    thread.platform === "instagram" && thread.account.igUsername
      ? `@${thread.account.igUsername}`
      : thread.account.pageName;
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 pb-3">
        <span className="text-lg" title={pm.label}>{pm.icon}</span>
        <div className="flex flex-col">
          <span className="text-base font-bold text-slate-800">{authorLabel(thread)}</span>
          <span className="text-xs text-slate-500">
            {KIND_META[thread.kind] ?? thread.kind} · {pm.label} · {pageLabel}
          </span>
        </div>
        <Chip color={sm.color}>{sm.label}</Chip>
        {thread.needsHuman ? <Chip color="#f59e0b">⚠ דורש אדם{thread.reason ? ` — ${thread.reason}` : ""}</Chip> : null}
        <Chip color={thread.client.color ?? "#64748b"}>{thread.client.name}</Chip>
        <div className="mr-auto flex items-center gap-2 text-xs">
          {thread.permalink ? (
            <a
              href={thread.permalink}
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-[#3a5bd9] hover:underline"
            >
              לפוסט בפייסבוק ↗
            </a>
          ) : null}
          <span className="text-slate-400">נפתח {formatDateTime(thread.createdAt)}</span>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        {thread.messages.map((m) => {
          const out = m.direction === "out";
          return (
            <div key={m.id} className={`flex ${out ? "justify-start" : "justify-end"}`}>
              <div
                className={`max-w-[85%] rounded-2xl px-3.5 py-2 text-sm shadow-sm ${
                  out
                    ? "rounded-tl-sm bg-[#3a5bd9] text-white"
                    : "rounded-tr-sm bg-white text-slate-800 ring-1 ring-slate-200"
                }`}
              >
                <p className="whitespace-pre-line break-words">{m.text}</p>
                <p className={`mt-1 text-[10px] ${out ? "text-white/70" : "text-slate-400"}`}>
                  {out ? `${pageLabel} · ` : m.authorName ? `${m.authorName} · ` : ""}
                  {formatDateTime(m.sentAt ?? m.createdAt)}
                </p>
              </div>
            </div>
          );
        })}
      </div>

      {thread.draftText ? (
        <div className="rounded-xl border border-violet-200 bg-violet-50 p-3 text-sm text-slate-700">
          <p className="mb-1 text-xs font-bold text-violet-700">טיוטת AI (ממתינה לאישור)</p>
          <p className="whitespace-pre-line">{thread.draftText}</p>
        </div>
      ) : null}

      <p className="rounded-xl bg-slate-50 px-3 py-2 text-[11px] text-slate-500">
        שלב 1a — תצוגה בלבד. טיוטות ומענה (אחרי אישור אדם) יתווספו בשלבים הבאים; בינתיים עונים
        מהממשק של פייסבוק/אינסטגרם, והתשובה תופיע כאן אוטומטית.
      </p>
    </div>
  );
}
