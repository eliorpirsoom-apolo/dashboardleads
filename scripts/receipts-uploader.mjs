// ============================================================================
// מעלה קבלות אוטומטי — רץ על מחשב המשרד (לא על השרת).
//
// מבנה התיקייה (RECEIPTS_DIR, ברירת מחדל C:/Receipts):
//   C:/Receipts/
//     נופי השרון נדל"ן/            <- שם הלקוח, זהה לשם במערכת
//       2026-07/
//         facebook/  קבלה1.pdf     <- קבלות פייסבוק
//         google/    קבלה2.pdf     <- קבלות גוגל
//         חשבונית.pdf              <- ישירות בתיקיית החודש = חשבונית
//
// הרצה ידנית:   node scripts/receipts-uploader.mjs
// הרצה רציפה:   node scripts/receipts-uploader.mjs --watch
// (מומלץ להוסיף למתזמן המשימות של Windows פעם ביום)
//
// env נדרשים (בקובץ .env ליד הסקריפט או במערכת):
//   CRM_BASE_URL            כתובת המערכת (https://your-app.vercel.app)
//   RECEIPTS_UPLOAD_TOKEN   אותו טוקן שמוגדר בשרת
//   RECEIPTS_DIR            תיקיית הקבלות (ברירת מחדל C:/Receipts)
// ============================================================================

import { readdirSync, readFileSync, statSync, existsSync } from "node:fs";
import path from "node:path";
import process from "node:process";

// Minimal .env loader (no dependency needed on the office machine).
try {
  const envFile = path.join(process.cwd(), ".env");
  if (existsSync(envFile)) {
    for (const line of readFileSync(envFile, "utf8").split("\n")) {
      const m = line.match(/^\s*([\w]+)\s*=\s*"?([^"\r\n]*)"?\s*$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
    }
  }
} catch {}

const BASE = (process.env.CRM_BASE_URL || "http://localhost:3000").replace(/\/$/, "");
const TOKEN = process.env.RECEIPTS_UPLOAD_TOKEN;
const DIR = process.env.RECEIPTS_DIR || "C:/Receipts";

if (!TOKEN) {
  console.error("חסר RECEIPTS_UPLOAD_TOKEN — הגדירו אותו ב-.env");
  process.exit(1);
}

const MIME = {
  ".pdf": "application/pdf",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
};

function* walkReceipts() {
  if (!existsSync(DIR)) {
    console.error(`תיקיית הקבלות לא נמצאה: ${DIR}`);
    process.exit(1);
  }
  for (const clientName of readdirSync(DIR)) {
    const clientDir = path.join(DIR, clientName);
    if (!statSync(clientDir).isDirectory()) continue;
    for (const month of readdirSync(clientDir)) {
      if (!/^\d{4}-\d{2}$/.test(month)) continue;
      const monthDir = path.join(clientDir, month);
      if (!statSync(monthDir).isDirectory()) continue;
      for (const entry of readdirSync(monthDir)) {
        const p = path.join(monthDir, entry);
        if (statSync(p).isDirectory()) {
          const category =
            entry.toLowerCase() === "facebook"
              ? "receipt_facebook"
              : entry.toLowerCase() === "google"
                ? "receipt_google"
                : null;
          if (!category) continue;
          for (const file of readdirSync(p)) {
            const fp = path.join(p, file);
            if (statSync(fp).isFile()) yield { clientName, month, category, file, fp };
          }
        } else {
          // Files directly under the month = invoices/documents.
          yield { clientName, month, category: "invoice", file: entry, fp: p };
        }
      }
    }
  }
}

async function uploadOne({ clientName, month, category, file, fp }) {
  const ext = path.extname(file).toLowerCase();
  const mimeType = MIME[ext];
  if (!mimeType) return { skip: true };

  const data = readFileSync(fp);
  const res = await fetch(`${BASE}/api/receipts-intake`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${TOKEN}`,
    },
    body: JSON.stringify({
      clientName,
      category,
      month,
      fileName: file,
      mimeType,
      dataBase64: data.toString("base64"),
    }),
  });
  const out = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(out.error || `HTTP ${res.status}`);
  return out;
}

async function runOnce() {
  let uploaded = 0,
    duplicates = 0,
    errors = 0;
  for (const item of walkReceipts()) {
    try {
      const out = await uploadOne(item);
      if (out.skip) continue;
      if (out.duplicate) duplicates++;
      else {
        uploaded++;
        console.log(`✓ ${item.clientName} / ${item.month} / ${item.file}`);
      }
    } catch (err) {
      errors++;
      console.error(`✗ ${item.clientName} / ${item.file}: ${err.message}`);
    }
  }
  console.log(`סיום: ${uploaded} הועלו, ${duplicates} כבר קיימים, ${errors} שגיאות`);
}

if (process.argv.includes("--watch")) {
  console.log(`מצב מעקב — סריקה כל 10 דקות (${DIR} → ${BASE})`);
  await runOnce();
  setInterval(runOnce, 10 * 60 * 1000);
} else {
  await runOnce();
}
