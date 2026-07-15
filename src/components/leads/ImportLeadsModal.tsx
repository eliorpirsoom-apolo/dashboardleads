"use client";

import { useState } from "react";
import { api } from "@/lib/fetcher";
import { Button, Field, Select } from "@/components/ui";
import { Icon } from "@/components/Icon";
import Modal from "@/components/Modal";

// ייבוא לידים מקובץ CSV — למשרד בלבד. שלבים: קובץ ⟵ מיפוי עמודות ⟵ ייבוא.

const TARGETS = [
  { value: "", label: "— דלג —" },
  { value: "fullName", label: "שם מלא" },
  { value: "phone", label: "טלפון" },
  { value: "email", label: "אימייל" },
  { value: "city", label: "עיר" },
  { value: "channel", label: "ערוץ" },
  { value: "campaignLabel", label: "קמפיין" },
  { value: "consent", label: "הסכמה לדיוור (כן/לא)" },
  { value: "receivedAt", label: "תאריך קבלה" },
  { value: "notes", label: "הערה" },
];

/** Minimal CSV parser: handles quoted cells, commas/semicolons, CRLF. */
function parseCsv(text: string): string[][] {
  const delimiter = text.split("\n")[0].includes(";") ? ";" : ",";
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i++;
        } else inQuotes = false;
      } else cell += ch;
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === delimiter) {
      row.push(cell);
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cell);
      cell = "";
      if (row.some((c) => c.trim() !== "")) rows.push(row);
      row = [];
    } else cell += ch;
  }
  if (cell !== "" || row.length) {
    row.push(cell);
    if (row.some((c) => c.trim() !== "")) rows.push(row);
  }
  return rows;
}

/** Auto-guess mapping from Hebrew/English header names. */
function guessTarget(header: string): string {
  const h = header.trim().toLowerCase();
  if (/שם|name/.test(h)) return "fullName";
  if (/טלפון|נייד|phone|tel|mobile/.test(h)) return "phone";
  if (/מייל|אימייל|email|mail/.test(h)) return "email";
  if (/עיר|city/.test(h)) return "city";
  if (/ערוץ|channel|source|מקור/.test(h)) return "channel";
  if (/קמפיין|campaign/.test(h)) return "campaignLabel";
  if (/הסכמה|דיוור|consent/.test(h)) return "consent";
  if (/תאריך|date/.test(h)) return "receivedAt";
  if (/הערה|notes?|comment/.test(h)) return "notes";
  return "";
}

export default function ImportLeadsModal({
  clientId,
  onClose,
  onImported,
}: {
  clientId: string;
  onClose: () => void;
  onImported: () => void;
}) {
  const [headers, setHeaders] = useState<string[]>([]);
  const [dataRows, setDataRows] = useState<string[][]>([]);
  const [mapping, setMapping] = useState<string[]>([]);
  const [fileName, setFileName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<{ created: number; duplicates: number; failed: number } | null>(null);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setError("");
    setResult(null);
    const text = await file.text();
    const rows = parseCsv(text);
    if (rows.length < 2) {
      setError("הקובץ ריק או חסרה שורת כותרות");
      return;
    }
    if (rows.length > 2001) {
      setError("מקסימום 2000 שורות בייבוא אחד — פצלו את הקובץ");
      return;
    }
    setHeaders(rows[0]);
    setDataRows(rows.slice(1));
    setMapping(rows[0].map(guessTarget));
  }

  async function runImport() {
    const hasContact = mapping.includes("phone") || mapping.includes("email") || mapping.includes("fullName");
    if (!hasContact) {
      setError("חובה למפות לפחות עמודה אחת: שם / טלפון / אימייל");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const rows = dataRows.map((r) => {
        const obj: Record<string, any> = {};
        mapping.forEach((target, i) => {
          if (!target) return;
          const raw = (r[i] ?? "").trim();
          if (!raw) return;
          if (target === "consent") {
            obj.consent = ["כן", "yes", "true", "1"].includes(raw.toLowerCase());
          } else {
            obj[target] = raw;
          }
        });
        return obj;
      });
      const res = await api<{ created: number; duplicates: number; failed: number }>(
        "/api/leads/import",
        { method: "POST", json: { clientId, rows } }
      );
      setResult(res);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title="ייבוא לידים מ-CSV" onClose={onClose} wide>
      <div className="flex flex-col gap-3">
        {error ? <p className="text-sm text-red-400">{error}</p> : null}

        {result ? (
          <div className="rounded-2xl border border-emerald-800/50 bg-emerald-950/30 p-5 text-center">
            <p className="text-lg font-bold text-emerald-300">הייבוא הושלם ✓</p>
            <p className="mt-2 text-sm text-slate-300">
              {result.created} נוצרו · {result.duplicates} דולגו (כפולים) · {result.failed} נכשלו
            </p>
            <Button className="mt-4" onClick={onImported}>סגירה ורענון</Button>
          </div>
        ) : headers.length === 0 ? (
          <label className="flex cursor-pointer flex-col items-center gap-2 rounded-2xl border border-dashed border-slate-600 py-10 transition hover:border-cyan-500/50">
            <Icon name="upload" className="h-7 w-7 text-slate-500" />
            <span className="text-sm text-slate-300">בחרו קובץ CSV (עד 2000 שורות)</span>
            <span className="text-xs text-slate-500">שורה ראשונה = כותרות עמודות</span>
            <input type="file" accept=".csv,text/csv" className="hidden" onChange={onFile} />
          </label>
        ) : (
          <>
            <p className="text-xs text-slate-400">
              <b className="text-slate-200">{fileName}</b> · {dataRows.length} שורות ·
              מיפוי אוטומטי זוהה — בדקו ותקנו במידת הצורך:
            </p>
            <div className="thin-scroll max-h-72 overflow-auto rounded-xl border border-slate-800">
              <table className="w-full min-w-[540px] text-right text-xs">
                <thead className="sticky top-0 bg-slate-900">
                  <tr>
                    <th className="px-3 py-2 font-medium text-slate-400">עמודה בקובץ</th>
                    <th className="px-3 py-2 font-medium text-slate-400">דוגמה</th>
                    <th className="px-3 py-2 font-medium text-slate-400">ייכנס לשדה</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {headers.map((h, i) => (
                    <tr key={i}>
                      <td className="px-3 py-2 font-medium text-slate-200">{h || `עמודה ${i + 1}`}</td>
                      <td className="max-w-[140px] truncate px-3 py-2 text-slate-500" dir="auto">
                        {dataRows[0]?.[i] ?? ""}
                      </td>
                      <td className="px-3 py-2">
                        <Select
                          value={mapping[i] ?? ""}
                          onChange={(e) =>
                            setMapping(mapping.map((m, idx) => (idx === i ? e.target.value : m)))
                          }
                          className="!py-1 !text-xs"
                        >
                          {TARGETS.map((t) => (
                            <option key={t.value} value={t.value}>{t.label}</option>
                          ))}
                        </Select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-[11px] text-slate-500">
              כפילויות (טלפון/אימייל שכבר קיימים אצל הלקוח) ידולגו אוטומטית.
            </p>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={onClose}>ביטול</Button>
              <Button onClick={runImport} disabled={busy}>
                {busy ? "מייבא…" : `ייבוא ${dataRows.length} שורות`}
              </Button>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
