"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "@/lib/fetcher";
import { Button, Card, Field, Input, Select, Textarea } from "@/components/ui";
import { Icon } from "@/components/Icon";
import Modal from "@/components/Modal";

// ---------------------------------------------------------------------------
// 🗂 מרשם הנכסים הדיגיטליים — שורה לכל לקוח: ביזנס מנג׳ר, דף, חשבון מודעות —
// בבעלות מי, יש גישה?, דרך אילו משתמשים, וסימון ✓ אוטומטי לדף שמחובר ל-CRM.
// ---------------------------------------------------------------------------

const KINDS: { key: string; label: string; icon: string }[] = [
  { key: "business_manager", label: "ביזנס מנג׳ר", icon: "🏢" },
  { key: "page", label: "דף פייסבוק", icon: "📘" },
  { key: "ad_account", label: "חשבון מודעות", icon: "📣" },
  { key: "instagram", label: "אינסטגרם", icon: "📷" },
  { key: "google_ads", label: "גוגל אדס", icon: "🔍" },
  { key: "other", label: "אחר", icon: "📌" },
];
const kindOf = (k: string) => KINDS.find((x) => x.key === k) ?? KINDS[5];

const OWNERSHIP: Record<string, { label: string; color: string }> = {
  client: { label: "בבעלות הלקוח", color: "#10b981" },
  agency: { label: "בבעלות אפולו", color: "#3a5bd9" },
  third_party: { label: "⚠️ צד שלישי", color: "#ef4444" },
};
const ACCESS: Record<string, { label: string; color: string }> = {
  full: { label: "גישה מלאה", color: "#10b981" },
  partial: { label: "גישה חלקית", color: "#f59e0b" },
  none: { label: "אין גישה", color: "#ef4444" },
};

interface Asset {
  id: string;
  clientId: string;
  kind: string;
  name: string | null;
  externalId: string | null;
  ownership: string;
  ownerNote: string | null;
  access: string;
  accessUsers: string | null;
  role: string | null;
  notes: string | null;
  updatedAt: string;
}
interface ClientRow {
  id: string;
  name: string;
  color: string | null;
}
interface MetaPageRow {
  clientId: string;
  pageId: string;
  pageName: string;
}

// סטטוס שליטה כולל ללקוח: 🔴 חשוף / 🟡 חלקי / 🟢 מלא.
function overallStatus(assets: Asset[]): { icon: string; label: string; color: string } {
  if (assets.length === 0) return { icon: "⚪", label: "לא מולא", color: "#94a3b8" };
  const danger = assets.some((a) => a.access === "none" || a.ownership === "third_party");
  if (danger) return { icon: "🔴", label: "חשוף", color: "#ef4444" };
  const core = ["business_manager", "page", "ad_account"];
  const missingCore = core.some((k) => !assets.some((a) => a.kind === k));
  const partial = assets.some((a) => a.access === "partial");
  if (missingCore || partial) return { icon: "🟡", label: "חלקי", color: "#f59e0b" };
  return { icon: "🟢", label: "שליטה מלאה", color: "#10b981" };
}

// 📋 העתקת ID בלחיצה — מופיע בריחוף ליד המספר, מציג ✓ ירוק אחרי העתקה.
function CopyId({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <span
      role="button"
      title={copied ? "הועתק ✓" : "העתקת ה-ID"}
      onClick={(e) => {
        e.stopPropagation();
        navigator.clipboard
          ?.writeText(value)
          .then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          })
          .catch(() => {});
      }}
      className="shrink-0 cursor-pointer text-slate-300 opacity-0 transition group-hover/id:opacity-100 hover:text-[#3a5bd9]"
    >
      {copied ? (
        <span className="text-[10px] font-bold text-emerald-600">✓</span>
      ) : (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-3 w-3">
          <rect x="9" y="9" width="11" height="11" rx="2" />
          <path d="M5 15H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2" />
        </svg>
      )}
    </span>
  );
}

export default function AssetsBoard() {
  const [clients, setClients] = useState<ClientRow[]>([]);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [metaPages, setMetaPages] = useState<MetaPageRow[]>([]);
  const [shown, setShown] = useState<Set<string>>(new Set()); // לקוחות שהוצגו ידנית
  const [error, setError] = useState("");
  const [editing, setEditing] = useState<Asset | null>(null);
  const [creating, setCreating] = useState<{ clientId: string; kind: string; name?: string; externalId?: string } | null>(null);

  const load = useCallback(async () => {
    try {
      const d = await api<{ clients: ClientRow[]; assets: Asset[]; metaPages: MetaPageRow[] }>("/api/assets");
      setClients(d.clients);
      setAssets(d.assets);
      setMetaPages(d.metaPages);
    } catch (e: any) {
      setError(e.message);
    }
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  const byClient = useMemo(() => {
    const map = new Map<string, Asset[]>();
    for (const a of assets) (map.get(a.clientId) ?? map.set(a.clientId, []).get(a.clientId)!).push(a);
    return map;
  }, [assets]);

  // שורות: לקוחות עם נכסים/חיבורי CRM, ומי שהוסף ידנית.
  const rows = clients.filter(
    (c) => byClient.has(c.id) || metaPages.some((p) => p.clientId === c.id) || shown.has(c.id)
  );
  const addable = clients.filter((c) => !rows.some((r) => r.id === c.id));

  const connectedPageIds = useMemo(() => new Set(metaPages.map((p) => p.pageId)), [metaPages]);

  function cellAssets(clientId: string, kinds: string[]): Asset[] {
    return (byClient.get(clientId) ?? []).filter((a) => kinds.includes(a.kind));
  }

  const idText = (a: Asset) =>
    a.externalId ? (
      <span dir="ltr" className="group/id flex items-center gap-1">
        <span className="truncate font-mono text-[10px] text-slate-500" title={a.externalId}>
          {a.externalId}
        </span>
        <CopyId value={a.externalId} />
      </span>
    ) : (
      <span className="text-[10px] text-slate-300">ללא ID</span>
    );

  const assetBlock = (a: Asset) => {
    const own = OWNERSHIP[a.ownership] ?? OWNERSHIP.client;
    const acc = ACCESS[a.access] ?? ACCESS.none;
    const crmConnected = a.kind === "page" && a.externalId && connectedPageIds.has(a.externalId);
    return (
      <button
        key={a.id}
        onClick={() => setEditing(a)}
        title="לחיצה לעריכה"
        className="block w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-right transition hover:border-[#3a5bd9]/50"
      >
        <span className="flex items-center gap-1">
          <span className="flex-1 truncate text-xs font-medium text-slate-700">
            {a.name || kindOf(a.kind).label}
          </span>
          {crmConnected ? (
            <span title="הדף מחובר ל-CRM ולידים נכנסים ממנו — מאומת אוטומטית" className="text-[10px] font-bold text-emerald-600">
              ✓CRM
            </span>
          ) : null}
        </span>
        {idText(a)}
        <span className="mt-1 flex flex-wrap items-center gap-1">
          {/* טקסט הבעלות החופשי מוצג אם מולא; הצבע לפי הקטגוריה (לדגלים) */}
          <span
            className="max-w-full truncate rounded-full px-1.5 py-0.5 text-[9px] font-bold"
            style={{ color: own.color, backgroundColor: `${own.color}1a` }}
            title={a.ownerNote ? `${own.label} — ${a.ownerNote}` : own.label}
          >
            {a.ownerNote || own.label}
          </span>
          <span className="rounded-full px-1.5 py-0.5 text-[9px] font-bold" style={{ color: acc.color, backgroundColor: `${acc.color}1a` }}>
            {acc.label}
          </span>
        </span>
        {a.accessUsers ? (
          <span className="mt-0.5 block truncate text-[10px] text-slate-500" title={`משתמשים מחוברים: ${a.accessUsers}`}>
            👤 {a.accessUsers}
          </span>
        ) : null}
      </button>
    );
  };

  // הסרת לקוח מהטבלה: מוחקת את כל רישומי הנכסים שלו. לקוח עם דף שמחובר
  // ל-CRM ימשיך להופיע (זו המציאות — החיבור חי), רק הרישומים הידניים יימחקו.
  async function removeClient(c: ClientRow) {
    const hasCrm = metaPages.some((p) => p.clientId === c.id);
    const msg = hasCrm
      ? `למחוק את כל רישומי הנכסים של "${c.name}"?\n\nשימו לב: ללקוח יש דף שמחובר ל-CRM, ולכן השורה תישאר (עם החיבור בלבד). הנכסים עצמם בפייסבוק לא נמחקים.`
      : `להסיר את "${c.name}" מהטבלה ולמחוק את כל רישומי הנכסים שלו?\n(הנכסים עצמם בפייסבוק/גוגל לא נמחקים)`;
    if (!confirm(msg)) return;
    try {
      await api(`/api/assets?clientId=${c.id}`, { method: "DELETE" });
      setShown((s) => {
        const next = new Set(s);
        next.delete(c.id);
        return next;
      });
      await load();
    } catch (e: any) {
      setError(e.message);
    }
  }

  const addBtn = (clientId: string, kind: string) => (
    <button
      onClick={() => setCreating({ clientId, kind })}
      className="mt-1 w-full rounded-lg border border-dashed border-slate-300 px-2 py-1 text-[10px] text-slate-400 transition hover:border-[#3a5bd9] hover:text-[#3a5bd9]"
    >
      + הוספה
    </button>
  );

  return (
    <div className="flex flex-col gap-4">
      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      <div className="flex flex-wrap items-center gap-2">
        <p className="text-xs text-slate-500">
          שורה לכל לקוח — במבט אחד: איפה כל נכס, מה ה-ID שלו, בבעלות מי והאם יש גישה.
          דף שמחובר ל-CRM מסומן <b className="text-emerald-600">✓CRM</b> אוטומטית.
        </p>
        <span className="flex-1" />
        {addable.length > 0 ? (
          <select
            value=""
            onChange={(e) => {
              // חשוב לקרוא את הערך לפני האיפוס — אחרת ה-updater רואה מחרוזת ריקה.
              const id = e.target.value;
              e.target.value = "";
              if (id) setShown((s) => new Set(s).add(id));
            }}
            className="rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-xs text-slate-600"
          >
            <option value="">+ הוספת לקוח לטבלה…</option>
            {addable.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        ) : null}
      </div>

      <Card className="overflow-x-auto p-0">
        <table className="w-full min-w-[1050px] table-fixed text-right text-sm">
          <colgroup>
            <col style={{ width: 150 }} />
            <col />
            <col />
            <col />
            <col />
            <col style={{ width: 90 }} />
          </colgroup>
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50/70 text-xs text-slate-500">
              <th className="px-3 py-2 text-right font-medium">לקוח</th>
              <th className="px-2 py-2 text-right font-medium">🏢 ביזנס מנג׳ר</th>
              <th className="px-2 py-2 text-right font-medium">📘 דף פייסבוק</th>
              <th className="px-2 py-2 text-right font-medium">📣 חשבון מודעות</th>
              <th className="px-2 py-2 text-right font-medium">📌 נכסים נוספים</th>
              <th className="px-2 py-2 text-center font-medium">שליטה</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((c) => {
              const clientAssets = byClient.get(c.id) ?? [];
              const st = overallStatus(clientAssets);
              // דפים שמחוברים ל-CRM אבל לא נרשמו בטבלה — תזכורת לרישום.
              const unregisteredPages = metaPages.filter(
                (p) => p.clientId === c.id && !clientAssets.some((a) => a.kind === "page" && a.externalId === p.pageId)
              );
              return (
                <tr key={c.id} className="border-b border-slate-100 align-top hover:bg-slate-50/60">
                  <td className="px-3 py-2.5">
                    <div className="group/client flex items-start gap-1">
                      <span
                        className="inline-block max-w-full truncate rounded-full px-2 py-0.5 text-xs font-bold"
                        style={{ color: c.color ?? "#334155", backgroundColor: `${c.color ?? "#64748b"}1a` }}
                      >
                        {c.name}
                      </span>
                      <button
                        onClick={() => removeClient(c)}
                        title="הסרת הלקוח מהטבלה (מחיקת כל רישומי הנכסים שלו)"
                        className="mt-0.5 shrink-0 text-slate-300 opacity-0 transition group-hover/client:opacity-100 hover:text-rose-500"
                      >
                        <Icon name="trash" className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </td>
                  <td className="px-2 py-2.5">
                    <div className="flex flex-col gap-1">
                      {cellAssets(c.id, ["business_manager"]).map(assetBlock)}
                      {addBtn(c.id, "business_manager")}
                    </div>
                  </td>
                  <td className="px-2 py-2.5">
                    <div className="flex flex-col gap-1">
                      {cellAssets(c.id, ["page"]).map(assetBlock)}
                      {unregisteredPages.map((p) => (
                        <button
                          key={p.pageId}
                          onClick={() => setCreating({ clientId: c.id, kind: "page", name: p.pageName, externalId: p.pageId })}
                          title="הדף מחובר ל-CRM אבל עוד לא נרשם במרשם — לחצו להשלמת הפרטים"
                          className="w-full rounded-lg border border-dashed border-emerald-300 bg-emerald-50 px-2 py-1.5 text-right text-[11px] text-emerald-700 transition hover:border-emerald-500"
                        >
                          ✓ מחובר ל-CRM: {p.pageName} — לחצו לרישום
                        </button>
                      ))}
                      {addBtn(c.id, "page")}
                    </div>
                  </td>
                  <td className="px-2 py-2.5">
                    <div className="flex flex-col gap-1">
                      {cellAssets(c.id, ["ad_account"]).map(assetBlock)}
                      {addBtn(c.id, "ad_account")}
                    </div>
                  </td>
                  <td className="px-2 py-2.5">
                    <div className="flex flex-col gap-1">
                      {cellAssets(c.id, ["instagram", "google_ads", "other"]).map(assetBlock)}
                      {addBtn(c.id, "instagram")}
                    </div>
                  </td>
                  <td className="px-2 py-2.5 text-center">
                    <span title={st.label} className="text-lg">{st.icon}</span>
                    <span className="block text-[10px] font-medium" style={{ color: st.color }}>
                      {st.label}
                    </span>
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-sm text-slate-500">
                  הטבלה ריקה — בחרו לקוח למעלה והתחילו לרשום את הנכסים שלו.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </Card>

      {creating ? (
        <AssetModal
          initial={{ clientId: creating.clientId, kind: creating.kind, name: creating.name, externalId: creating.externalId }}
          onClose={() => setCreating(null)}
          onSaved={() => { setCreating(null); load(); }}
        />
      ) : null}
      {editing ? (
        <AssetModal
          asset={editing}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); load(); }}
        />
      ) : null}
    </div>
  );
}

function AssetModal({
  asset,
  initial,
  onClose,
  onSaved,
}: {
  asset?: Asset;
  initial?: { clientId: string; kind: string; name?: string; externalId?: string };
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState({
    kind: asset?.kind ?? initial?.kind ?? "page",
    name: asset?.name ?? initial?.name ?? "",
    externalId: asset?.externalId ?? initial?.externalId ?? "",
    ownership: asset?.ownership ?? "client",
    ownerNote: asset?.ownerNote ?? "",
    access: asset?.access ?? "full",
    accessUsers: asset?.accessUsers ?? "",
    role: asset?.role ?? "",
    notes: asset?.notes ?? "",
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const payload = {
      kind: form.kind,
      name: form.name || null,
      externalId: form.externalId || null,
      ownership: form.ownership,
      ownerNote: form.ownerNote || null,
      access: form.access,
      accessUsers: form.accessUsers || null,
      role: form.role || null,
      notes: form.notes || null,
    };
    try {
      if (asset) {
        await api(`/api/assets/${asset.id}`, { method: "PATCH", json: payload });
      } else {
        await api("/api/assets", { method: "POST", json: { clientId: initial!.clientId, ...payload } });
      }
      onSaved();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!asset) return;
    if (!confirm("להסיר את הרישום מהטבלה? (הנכס עצמו בפייסבוק/גוגל לא נמחק כמובן)")) return;
    await api(`/api/assets/${asset.id}`, { method: "DELETE" });
    onSaved();
  }

  return (
    <Modal title={asset ? "עריכת נכס" : "רישום נכס חדש"} onClose={onClose}>
      <form onSubmit={submit} className="flex flex-col gap-3">
        {error ? <p className="text-sm text-red-600">{error}</p> : null}
        <div className="grid grid-cols-2 gap-3">
          <Field label="סוג הנכס">
            <Select value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })}>
              {KINDS.map((k) => (
                <option key={k.key} value={k.key}>{k.icon} {k.label}</option>
              ))}
            </Select>
          </Field>
          <Field label="שם הנכס">
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder='"יורם בונה הארץ BM"' />
          </Field>
        </div>
        <Field label="ID בפלטפורמה" hint="Business ID / Page ID / act_XXXXXXX — מה שמזהה את הנכס">
          <Input dir="ltr" value={form.externalId} onChange={(e) => setForm({ ...form, externalId: e.target.value })} placeholder="1234567890" />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="בבעלות מי?">
            <Select value={form.ownership} onChange={(e) => setForm({ ...form, ownership: e.target.value })}>
              <option value="client">הלקוח</option>
              <option value="agency">אפולו פרסום</option>
              <option value="third_party">⚠️ צד שלישי</option>
            </Select>
          </Field>
          <Field label="גישה שלנו">
            <Select value={form.access} onChange={(e) => setForm({ ...form, access: e.target.value })}>
              <option value="full">מלאה</option>
              <option value="partial">חלקית</option>
              <option value="none">אין גישה</option>
            </Select>
          </Field>
        </div>
        <Field
          label="בבעלות מי — טקסט חופשי"
          hint='מה שיוצג בטבלה. למשל: "הביזנס האישי של יורם", "סוכנות קודמת — X", "שותף של הלקוח"'
        >
          <Input value={form.ownerNote} onChange={(e) => setForm({ ...form, ownerNote: e.target.value })} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="משתמשים מחוברים" hint="מי מהמשרד ניגש — מופרד בפסיקים">
            <Input value={form.accessUsers} onChange={(e) => setForm({ ...form, accessUsers: e.target.value })} placeholder="אליאור, בר" />
          </Field>
          <Field label="רמת הרשאה">
            <Input value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} placeholder="Admin / Editor / Advertiser" />
          </Field>
        </div>
        <Field label="הערות">
          <Textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
        </Field>
        <div className="mt-1 flex items-center justify-between">
          {asset ? (
            <button type="button" onClick={remove} className="flex items-center gap-1 text-xs text-slate-400 hover:text-rose-500">
              <Icon name="trash" className="h-3.5 w-3.5" /> הסרת הרישום
            </button>
          ) : <span />}
          <div className="flex gap-2">
            <Button type="button" variant="ghost" onClick={onClose}>ביטול</Button>
            <Button type="submit" disabled={busy}>{busy ? "שומר…" : "שמירה"}</Button>
          </div>
        </div>
      </form>
    </Modal>
  );
}
