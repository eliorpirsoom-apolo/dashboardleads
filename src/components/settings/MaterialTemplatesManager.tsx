"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/fetcher";
import { Button, Card, Field, Input } from "@/components/ui";
import { Icon } from "@/components/Icon";
import Modal from "@/components/Modal";

interface Template {
  id: string;
  name: string;
  items: string[];
}

// ניהול תבניות "מכולת" — רשימות חומרים לפי סוג פרויקט.
export default function MaterialTemplatesManager() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [edit, setEdit] = useState<Template | null>(null);
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    const d = await api<{ templates: Template[] }>("/api/material-templates");
    setTemplates(d.templates);
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  async function remove(t: Template) {
    if (!confirm(`למחוק את התבנית "${t.name}"?`)) return;
    await api(`/api/material-templates/${t.id}`, { method: "DELETE" });
    load();
  }

  return (
    <Card>
      <div className="mb-3 flex items-center justify-between">
        <div>
          <h3 className="text-base font-bold text-slate-100">רשימות חומרים (מכולת)</h3>
          <p className="mt-0.5 text-xs text-slate-500">
            מה צריך מהלקוח לכל סוג פרויקט. בפתיחת פרויקט בוחרים תבנית — והרשימה נשלחת ללקוח.
          </p>
        </div>
        <Button size="sm" onClick={() => setCreating(true)}>
          <Icon name="plus" className="h-4 w-4" />
          תבנית חדשה
        </Button>
      </div>

      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {templates.map((t) => (
          <button
            key={t.id}
            onClick={() => setEdit(t)}
            className="rounded-xl border border-slate-800 bg-slate-900/40 p-3 text-right transition hover:border-cyan-500/40"
          >
            <div className="flex items-center justify-between">
              <span className="font-bold text-slate-100">{t.name}</span>
              <Icon name="folder" className="h-4 w-4 text-cyan-400" />
            </div>
            <p className="mt-1 text-xs text-slate-500">{t.items.length} פריטים</p>
            <p className="mt-1 line-clamp-2 text-[11px] text-slate-600">
              {t.items.slice(0, 4).join(" · ")}
            </p>
          </button>
        ))}
        {templates.length === 0 ? (
          <p className="text-xs text-slate-600">אין תבניות עדיין.</p>
        ) : null}
      </div>

      {edit ? (
        <TemplateModal
          template={edit}
          onClose={() => setEdit(null)}
          onSaved={() => {
            setEdit(null);
            load();
          }}
          onDelete={() => {
            remove(edit);
            setEdit(null);
          }}
        />
      ) : null}
      {creating ? (
        <TemplateModal
          onClose={() => setCreating(false)}
          onSaved={() => {
            setCreating(false);
            load();
          }}
        />
      ) : null}
    </Card>
  );
}

function TemplateModal({
  template,
  onClose,
  onSaved,
  onDelete,
}: {
  template?: Template;
  onClose: () => void;
  onSaved: () => void;
  onDelete?: () => void;
}) {
  const [name, setName] = useState(template?.name ?? "");
  const [items, setItems] = useState<string[]>(template?.items ?? [""]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  function setItem(i: number, v: string) {
    setItems(items.map((x, idx) => (idx === i ? v : x)));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const clean = items.map((s) => s.trim()).filter(Boolean);
    try {
      if (template) {
        await api(`/api/material-templates/${template.id}`, {
          method: "PATCH",
          json: { name, items: clean },
        });
      } else {
        await api("/api/material-templates", { method: "POST", json: { name, items: clean } });
      }
      onSaved();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title={template ? `עריכת תבנית — ${template.name}` : "תבנית חומרים חדשה"} onClose={onClose} wide>
      <form onSubmit={submit} className="flex flex-col gap-3">
        {error ? <p className="text-sm text-red-400">{error}</p> : null}
        <Field label="שם התבנית (סוג הפרויקט)">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder='למשל: "אתר תדמית"' required />
        </Field>
        <div>
          <p className="mb-2 text-xs font-medium text-slate-400">פריטי החומרים</p>
          <div className="flex flex-col gap-1.5">
            {items.map((it, i) => (
              <div key={i} className="flex items-center gap-2">
                <span className="text-xs text-slate-600">{i + 1}.</span>
                <Input
                  value={it}
                  onChange={(e) => setItem(i, e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      setItems([...items.slice(0, i + 1), "", ...items.slice(i + 1)]);
                    }
                  }}
                  placeholder="פריט חדש…"
                />
                <button
                  type="button"
                  onClick={() => setItems(items.filter((_, idx) => idx !== i))}
                  className="rounded p-1.5 text-slate-600 hover:text-red-400"
                >
                  <Icon name="trash" className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="mt-2"
            onClick={() => setItems([...items, ""])}
          >
            <Icon name="plus" className="h-3.5 w-3.5" />
            פריט
          </Button>
        </div>
        <div className="mt-1 flex items-center justify-between">
          {onDelete ? (
            <Button type="button" variant="ghost" onClick={onDelete} className="!text-red-400">
              מחיקת תבנית
            </Button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <Button type="button" variant="ghost" onClick={onClose}>ביטול</Button>
            <Button type="submit" disabled={busy}>{busy ? "שומר…" : "שמירה"}</Button>
          </div>
        </div>
      </form>
    </Modal>
  );
}
