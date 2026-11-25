"use client";

import { useState } from "react";
import { api } from "@/lib/fetcher";
import { Button, Select } from "@/components/ui";
import { Icon } from "@/components/Icon";
import Modal from "@/components/Modal";

// ייבוא משימות לרשימת השבוע מקובץ Excel/CSV. שלבים: קובץ ⟵ מיפוי עמודות ⟵ ייבוא.
// קטגוריה לפי שם, לקוח/פרויקט בהתאמה אוטומטית לפי שם (בשרת).

const TARGETS = [
  { value: "", label: "— דלג —" },
  { value: "category", label: "קטגוריה" },
  { value: "client", label: "לקוח" },
  { value: "project", label: "פרויקט" },
  { value: "title", label: "משימה" },
  { value: "note", label: "הערה" },
  { value: "at", label: "מתי (תאריך/שעה)" },
];

interface ImportResult {
  created: number;
  skipped: number;
  uncategorized: number;
  unmatchedClients: string[];
  unmatchedProjects: string[];
  week: "this" | "next";
}

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
  if (/קטגוריה|category|נושא/.test(h)) return "category";
  if (/פרויקט|project/.test(h)) return "project";
  if (/לקוח|client|customer/.test(h)) return "client";
  if (/משימה|כותרת|task|title|פעולה/.test(h)) return "title";
  if (/הערה|פירוט|notes?|comment/.test(h)) return "note";
  if (/מתי|תאריך|שעה|date|time|when/.test(h)) return "at";
  return "";
}

// קובץ תבנית לדוגמה (עם BOM כדי שאקסל יציג עברית נכון).
function downloadTemplate() {
  const rows = [
    ["קטגוריה", "לקוח", "פרויקט", "משימה", "הערה", "מתי"],
    ["קמפיינים", "נופי השרון נדל\"ן", "מגדלי הפארק — הרצליה", "להעלות 3 קריאייטיבים", "", ""],
    ["גבייה", "נופי השרון נדל\"ן", "", "לשלוח תזכורת תשלום", "דחוף", ""],
    ["פגישות", "", "", "פגישת צוות שבועית", "", "יום ראשון 10:00"],
    ["ימי צילום", "", "", "תיאום יום צילום דירה לדוגמה", "", ""],
    ["משימות משרד", "", "", "לסדר את הארכיון", "", ""],
  ];
  const csv = rows.map((r) => r.map((c) => (/[",;\n]/.test(c) ? `"${c.replace(/"/g, '""')}"` : c)).join(",")).join("\r\n");
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "תבנית-רשימת-השבוע.csv";
  a.click();
  URL.revokeObjectURL(url);
}

export default function WeeklyImportModal({
  defaultWeek = "this",
  onClose,
  onImported,
}: {
  defaultWeek?: "this" | "next";
  onClose: () => void;
  onImported: () => void;
}) {
  const [headers, setHeaders] = useState<string[]>([]);
  const [dataRows, setDataRows] = useState<string[][]>([]);
  const [mapping, setMapping] = useState<string[]>([]);
  const [fileName, setFileName] = useState("");
  const [week, setWeek] = useState<"this" | "next">(defaultWeek);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<ImportResult | null>(null);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setError("");
    setResult(null);
    let rows: string[][];
    if (/\.xlsx?$/i.test(file.name)) {
      const XLSX = await import("xlsx");
      const wb = XLSX.read(await file.arrayBuffer(), { type: "array" });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      if (!sheet) {
        setError("קובץ האקסל ריק");
        return;
      }
      const raw = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: false, defval: "" });
      rows = raw
        .map((r) => (Array.isArray(r) ? r.map((c) => String(c ?? "").trim()) : []))
        .filter((r) => r.some((c) => c !== ""));
    } else {
      rows = parseCsv(await file.text());
    }
    if (rows.length < 2) {
      setError("הקובץ ריק או חסרה שורת כותרות");
      return;
    }
    if (rows.length > 1001) {
      setError("מקסימום 1000 שורות בייבוא אחד — פצלו את הקובץ");
      return;
    }
    setHeaders(rows[0]);
    setDataRows(rows.slice(1));
    setMapping(rows[0].map(guessTarget));
  }

  async function runImport() {
    if (!mapping.includes("title")) {
      setError("חובה למפות עמודה אחת ל״משימה״");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const rows = dataRows.map((r) => {
        const obj: Record<string, string> = {};
        mapping.forEach((target, i) => {
          if (!target) return;
          const raw = (r[i] ?? "").trim();
          if (raw) obj[target] = raw;
        });
        return obj;
      });
      const res = await api<ImportResult>("/api/weekly-tasks/import", { method: "POST", json: { week, rows } });
      setResult(res);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title="ייבוא משימות מקובץ (Excel / CSV)" onClose={onClose} wide>
      <div className="flex flex-col gap-3">
        {error ? <p className="text-sm text-red-600">{error}</p> : null}

        {result ? (
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5">
            <p className="text-center text-lg font-bold text-emerald-700">הייבוא הושלם ✓</p>
            <p className="mt-2 text-center text-sm text-slate-600">
              {result.created} משימות נוצרו · נכנסו ל{result.week === "next" ? "שבוע הבא" : "שבוע הנוכחי"}
              {result.skipped ? ` · ${result.skipped} שורות ריקות דולגו` : ""}
            </p>
            {result.uncategorized > 0 ? (
              <p className="mt-2 text-center text-xs text-amber-700">
                ⚠️ {result.uncategorized} משימות ללא קטגוריה מזוהה — נכנסו ל״משימות שונות״.
              </p>
            ) : null}
            {result.unmatchedClients.length > 0 ? (
              <p className="mt-2 text-xs text-slate-500">
                לקוחות שלא זוהו (נכנסו בלי שיוך): {result.unmatchedClients.join(", ")}
              </p>
            ) : null}
            {result.unmatchedProjects.length > 0 ? (
              <p className="mt-1 text-xs text-slate-500">
                פרויקטים שלא זוהו: {result.unmatchedProjects.join(", ")}
              </p>
            ) : null}
            <div className="mt-4 flex justify-center">
              <Button onClick={onImported}>סגירה ורענון</Button>
            </div>
          </div>
        ) : headers.length === 0 ? (
          <>
            <label className="flex cursor-pointer flex-col items-center gap-2 rounded-2xl border border-dashed border-slate-400 py-10 transition hover:border-[#3a5bd9]">
              <Icon name="upload" className="h-7 w-7 text-slate-500" />
              <span className="text-sm text-slate-600">בחרו קובץ Excel (xlsx) או CSV — עד 1000 שורות</span>
              <span className="text-xs text-slate-500">שורה ראשונה = כותרות · עמודות: קטגוריה, לקוח, פרויקט, משימה</span>
              <input
                type="file"
                accept=".csv,text/csv,.xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                className="hidden"
                onChange={onFile}
              />
            </label>
            <button onClick={downloadTemplate} className="mx-auto text-xs font-medium text-[#3a5bd9] hover:underline">
              ⬇️ הורדת תבנית לדוגמה (CSV)
            </button>
          </>
        ) : (
          <>
            <p className="text-xs text-slate-400">
              <b className="text-slate-700">{fileName}</b> · {dataRows.length} שורות · מיפוי אוטומטי זוהה — בדקו ותקנו:
            </p>
            <div className="thin-scroll max-h-72 overflow-auto rounded-xl border border-slate-200">
              <table className="w-full min-w-[540px] text-right text-xs">
                <thead className="sticky top-0 bg-white">
                  <tr>
                    <th className="px-3 py-2 font-medium text-slate-400">עמודה בקובץ</th>
                    <th className="px-3 py-2 font-medium text-slate-400">דוגמה</th>
                    <th className="px-3 py-2 font-medium text-slate-400">ייכנס לשדה</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {headers.map((h, i) => (
                    <tr key={i}>
                      <td className="px-3 py-2 font-medium text-slate-700">{h || `עמודה ${i + 1}`}</td>
                      <td className="max-w-[140px] truncate px-3 py-2 text-slate-500" dir="auto">
                        {dataRows[0]?.[i] ?? ""}
                      </td>
                      <td className="px-3 py-2">
                        <Select
                          value={mapping[i] ?? ""}
                          onChange={(e) => setMapping(mapping.map((m, idx) => (idx === i ? e.target.value : m)))}
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

            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-xs text-slate-500">
                <span>מייבא אל:</span>
                <div className="flex rounded-xl border border-slate-200 bg-slate-50 p-0.5">
                  {(["this", "next"] as const).map((w) => (
                    <button
                      key={w}
                      type="button"
                      onClick={() => setWeek(w)}
                      className={`rounded-lg px-3 py-1 text-xs font-medium transition ${
                        week === w ? "bg-[#3a5bd9] text-white" : "text-slate-500 hover:text-slate-700"
                      }`}
                    >
                      {w === "this" ? "השבוע" : "השבוע הבא"}
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex gap-2">
                <Button variant="ghost" onClick={onClose}>ביטול</Button>
                <Button onClick={runImport} disabled={busy}>
                  {busy ? "מייבא…" : `ייבוא ${dataRows.length} שורות`}
                </Button>
              </div>
            </div>
            <p className="text-[11px] text-slate-500">
              קטגוריה מזוהה לפי השם (גבייה / פגישות / משימות משרד / קמפיינים / ימי צילום / משימות שונות). לקוח ופרויקט
              משויכים אוטומטית לפי שם — מה שלא יזוהה ייכנס בלי שיוך ויופיע בדוח.
            </p>
          </>
        )}
      </div>
    </Modal>
  );
}
