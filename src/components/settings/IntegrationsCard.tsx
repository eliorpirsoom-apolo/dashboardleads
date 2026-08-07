"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/fetcher";
import { formatDateTime } from "@/lib/format";
import { Button, Card, Chip, Field, Input } from "@/components/ui";
import { Icon } from "@/components/Icon";

interface IntegrationRow {
  id: string;
  kind: string;
  status: string;
  lastSyncAt: string | null;
  lastError: string | null;
}

// Per-client external connections, managed by the agency:
// Meta (ads insights), Paycall note, Search Console / GA4 config.
export default function IntegrationsCard({
  clientId,
  clientType,
}: {
  clientId: string;
  clientType: string;
}) {
  const [rows, setRows] = useState<IntegrationRow[]>([]);
  const [meta, setMeta] = useState({ adAccountId: "", accessToken: "" });
  const [wa, setWa] = useState({ idInstance: "", apiToken: "" });
  const [gscSite, setGscSite] = useState("");
  const [gaProperty, setGaProperty] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const d = await api<{ clientIntegrations: IntegrationRow[] }>(
        `/api/integrations?clientId=${clientId}`
      );
      setRows(d.clientIntegrations);
    } catch {}
  }, [clientId]);

  useEffect(() => {
    load();
  }, [load]);

  const get = (kind: string) => rows.find((r) => r.kind === kind);

  async function saveMeta(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg("");
    try {
      await api("/api/integrations", {
        method: "POST",
        json: { clientId, kind: "meta", config: meta },
      });
      setMsg("חיבור Meta נשמר ✓");
      setMeta({ adAccountId: "", accessToken: "" });
      load();
    } catch (e: any) {
      setMsg(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function syncMeta() {
    setBusy(true);
    setMsg("");
    try {
      const d = await api<{ campaigns: number; month: string }>(
        "/api/integrations/meta/sync",
        { method: "POST", json: { clientId } }
      );
      setMsg(`סונכרנו ${d.campaigns} קמפיינים לחודש ${d.month} ✓ (וואטסאפים + 2 מודעות חזקות)`);
      load();
    } catch (e: any) {
      setMsg(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function saveSeoConfig(kind: string, config: Record<string, string>) {
    setBusy(true);
    setMsg("");
    try {
      await api("/api/integrations", {
        method: "POST",
        json: { clientId, kind, config },
      });
      setMsg("ההגדרה נשמרה ✓");
      load();
    } catch (e: any) {
      setMsg(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function saveWa(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg("");
    try {
      await api("/api/integrations", {
        method: "POST",
        json: { clientId, kind: "whatsapp", config: wa },
      });
      setMsg("מספר הוואטסאפ הייעודי חובר ✓ — הלידים של הלקוח ישוחחו דרכו");
      setWa({ idInstance: "", apiToken: "" });
      load();
    } catch (e: any) {
      setMsg(e.message);
    } finally {
      setBusy(false);
    }
  }

  const metaRow = get("meta");
  const waRow = get("whatsapp");

  return (
    <Card>
      <h3 className="mb-1 text-base font-bold text-slate-800">אינטגרציות הלקוח</h3>
      <p className="mb-4 text-xs text-slate-500">
        חיבורים חיצוניים ללקוח הזה — הוראות מפורטות בקובץ CONNECTIONS.md.
      </p>

      {msg ? (
        <p className="mb-3 rounded-xl border border-cyan-200 bg-cyan-50 px-3 py-2 text-xs text-cyan-700">{msg}</p>
      ) : null}

      <div className="flex flex-col gap-3">
        {/* Meta */}
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
          <div className="mb-2 flex items-center gap-2">
            <Icon name="megaphone" className="h-4 w-4 text-blue-400" />
            <span className="text-sm font-bold text-slate-700">Meta — מנהל המודעות</span>
            <Chip color={metaRow?.status === "connected" ? "#34d399" : metaRow?.status === "error" ? "#f87171" : "#64748b"}>
              {metaRow?.status === "connected" ? "מחובר" : metaRow?.status === "error" ? "שגיאה" : "לא מחובר"}
            </Chip>
            {metaRow?.lastSyncAt ? (
              <span className="text-[10px] text-slate-500">סונכרן {formatDateTime(metaRow.lastSyncAt)}</span>
            ) : null}
            {metaRow?.status === "connected" ? (
              <Button variant="ghost" size="sm" className="mr-auto" disabled={busy} onClick={syncMeta}>
                סנכרון עכשיו
              </Button>
            ) : null}
          </div>
          <p className="mb-2 text-[11px] text-slate-500">
            מושך אוטומטית: כמות שיחות וואטסאפ מקמפיינים + 2 המודעות החזקות של החודש.
          </p>
          <form onSubmit={saveMeta} className="flex flex-wrap items-end gap-2">
            <div className="w-44">
              <Field label="Ad Account ID">
                <Input dir="ltr" value={meta.adAccountId} onChange={(e) => setMeta({ ...meta, adAccountId: e.target.value })} placeholder="act_1234567890" />
              </Field>
            </div>
            <div className="min-w-[200px] flex-1">
              <Field label="Access Token">
                <Input dir="ltr" type="password" value={meta.accessToken} onChange={(e) => setMeta({ ...meta, accessToken: e.target.value })} placeholder="EAAG..." />
              </Field>
            </div>
            <Button type="submit" size="sm" variant="ghost" disabled={busy || !meta.adAccountId || !meta.accessToken}>
              שמירה
            </Button>
          </form>
        </div>

        {/* מספר וואטסאפ ייעודי ללקוח (Green API) — שיחות עם הלידים */}
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
          <div className="mb-2 flex items-center gap-2">
            <Icon name="whatsapp" className="h-4 w-4 text-emerald-500" />
            <span className="text-sm font-bold text-slate-700">וואטסאפ ייעודי — שיחות עם לידים</span>
            <Chip color={waRow?.status === "connected" ? "#34d399" : "#64748b"}>
              {waRow?.status === "connected" ? "מחובר" : "לא מחובר"}
            </Chip>
          </div>
          <p className="mb-2 text-[11px] text-slate-500">
            מופע Green API נפרד עם מספר של הלקוח — הלידים שלו ישוחחו עם המספר הזה במקום מספר
            הסוכנות. דורש רכישת מופע Green API וסריקת QR עם מספר הלקוח. בשמירה המערכת מאמתת את
            הפרטים ומכוונת את קליטת התשובות אוטומטית.
          </p>
          <form onSubmit={saveWa} className="flex flex-wrap items-end gap-2">
            <div className="w-44">
              <Field label="ID Instance">
                <Input dir="ltr" value={wa.idInstance} onChange={(e) => setWa({ ...wa, idInstance: e.target.value })} placeholder="1101234567" />
              </Field>
            </div>
            <div className="min-w-[200px] flex-1">
              <Field label="API Token">
                <Input dir="ltr" type="password" value={wa.apiToken} onChange={(e) => setWa({ ...wa, apiToken: e.target.value })} />
              </Field>
            </div>
            <Button type="submit" size="sm" variant="ghost" disabled={busy || !wa.idInstance || !wa.apiToken}>
              שמירה וחיבור
            </Button>
          </form>
        </div>

        {/* SEO connections config */}
        {clientType === "seo" ? (
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
            <div className="mb-2 flex items-center gap-2">
              <Icon name="search" className="h-4 w-4 text-emerald-400" />
              <span className="text-sm font-bold text-slate-700">Search Console + Analytics</span>
              <Chip color={get("search_console")?.status === "connected" ? "#34d399" : "#64748b"}>
                GSC: {get("search_console")?.status === "connected" ? "מחובר" : "לא"}
              </Chip>
              <Chip color={get("ga4")?.status === "connected" ? "#34d399" : "#64748b"}>
                GA4: {get("ga4")?.status === "connected" ? "מחובר" : "לא"}
              </Chip>
            </div>
            <p className="mb-2 text-[11px] text-slate-500">
              שלב 1: חיבור OAuth בטאב ה-SEO של הלקוח. שלב 2: הגדרת כתובת האתר / Property כאן.
            </p>
            <div className="flex flex-wrap items-end gap-2">
              <div className="min-w-[180px] flex-1">
                <Field label="כתובת האתר ב-Search Console">
                  <Input dir="ltr" value={gscSite} onChange={(e) => setGscSite(e.target.value)} placeholder="https://example.co.il/ או sc-domain:example.co.il" />
                </Field>
              </div>
              <Button size="sm" variant="ghost" disabled={busy || !gscSite} onClick={() => saveSeoConfig("search_console", { siteUrl: gscSite })}>
                שמירה
              </Button>
              <div className="w-40">
                <Field label="GA4 Property ID">
                  <Input dir="ltr" value={gaProperty} onChange={(e) => setGaProperty(e.target.value)} placeholder="123456789" />
                </Field>
              </div>
              <Button size="sm" variant="ghost" disabled={busy || !gaProperty} onClick={() => saveSeoConfig("ga4", { propertyId: gaProperty })}>
                שמירה
              </Button>
            </div>
          </div>
        ) : null}

        {/* Paycall note */}
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
          <div className="flex items-center gap-2">
            <Icon name="phone" className="h-4 w-4 text-emerald-400" />
            <span className="text-sm font-bold text-slate-700">פייקול — לידים טלפוניים</span>
          </div>
          <p className="mt-1 text-[11px] text-slate-500">
            שיחות נקלטות דרך מקור קליטה מסוג &quot;שיחות&quot; (למעלה) המחובר לפייקול דרך
            Make/Zapier — כולל מספר, משך, סטטוס והקלטה. אין צורך בחיבור נוסף כאן.
          </p>
        </div>
      </div>
    </Card>
  );
}
