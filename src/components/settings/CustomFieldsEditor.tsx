"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/fetcher";
import { Button, Card, Field, Input, Select } from "@/components/ui";
import { Icon } from "@/components/Icon";

interface FieldDef {
  id: string;
  key: string;
  label: string;
  fieldType: string;
  options: string | null;
}

const TYPES = [
  { value: "text", label: "טקסט" },
  { value: "number", label: "מספר" },
  { value: "date", label: "תאריך" },
  { value: "select", label: "רשימת בחירה" },
  { value: "boolean", label: "כן / לא" },
];

export default function CustomFieldsEditor({ clientId }: { clientId: string }) {
  const [fields, setFields] = useState<FieldDef[]>([]);
  const [label, setLabel] = useState("");
  const [fieldType, setFieldType] = useState("text");
  const [options, setOptions] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const d = await api<{ fields: FieldDef[] }>(`/api/custom-fields?clientId=${clientId}`);
      setFields(d.fields);
    } catch (e: any) {
      setError(e.message);
    }
  }, [clientId]);

  useEffect(() => {
    load();
  }, [load]);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api("/api/custom-fields", {
        method: "POST",
        json: {
          clientId,
          label,
          fieldType,
          ...(fieldType === "select"
            ? { options: options.split(",").map((s) => s.trim()).filter(Boolean) }
            : {}),
        },
      });
      setLabel("");
      setOptions("");
      await load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    if (!confirm("להסיר את השדה? (ערכים קיימים בלידים נשמרים)")) return;
    await api(`/api/custom-fields/${id}`, { method: "DELETE" });
    await load();
  }

  return (
    <Card>
      <h3 className="mb-1 text-base font-bold text-slate-800">שדות חופשיים</h3>
      <p className="mb-4 text-xs text-slate-500">
        שדות שמתווספים לכרטיס הליד, לטבלה ולייצוא — בלי לגעת בקוד.
      </p>

      {error ? <p className="mb-3 text-sm text-red-600">{error}</p> : null}

      <div className="flex flex-col gap-2">
        {fields.map((f) => (
          <div key={f.id} className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
            <Icon name="edit" className="h-4 w-4 text-cyan-400" />
            <span className="text-sm font-medium text-slate-700">{f.label}</span>
            <span className="text-xs text-slate-500">
              {TYPES.find((t) => t.value === f.fieldType)?.label}
              {f.options ? ` · ${JSON.parse(f.options).join(" / ")}` : ""}
            </span>
            <button onClick={() => remove(f.id)} className="mr-auto rounded p-1 text-slate-500 hover:text-red-600" title="הסרה">
              <Icon name="trash" className="h-4 w-4" />
            </button>
          </div>
        ))}
        {fields.length === 0 ? (
          <p className="text-xs text-slate-600">אין שדות מותאמים עדיין.</p>
        ) : null}
      </div>

      <form onSubmit={add} className="mt-4 flex flex-wrap items-end gap-2 border-t border-slate-200 pt-4">
        <div className="min-w-[140px] flex-1">
          <Field label="שם השדה">
            <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder='למשל: תקציב, מ"ר מבוקש' required />
          </Field>
        </div>
        <div className="w-36">
          <Field label="סוג">
            <Select value={fieldType} onChange={(e) => setFieldType(e.target.value)}>
              {TYPES.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </Select>
          </Field>
        </div>
        {fieldType === "select" ? (
          <div className="min-w-[200px] flex-1">
            <Field label="אפשרויות (מופרדות בפסיק)">
              <Input value={options} onChange={(e) => setOptions(e.target.value)} placeholder="3 חד׳, 4 חד׳, 5 חד׳" />
            </Field>
          </div>
        ) : null}
        <Button type="submit" disabled={busy}>
          <Icon name="plus" className="h-4 w-4" />
          הוספה
        </Button>
      </form>
    </Card>
  );
}
