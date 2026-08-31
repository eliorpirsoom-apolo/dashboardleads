import { prisma } from "@/lib/prisma";
import {
  sumitConfigured,
  sumitListDocuments,
  sumitDocumentCustomer,
  sumitDocumentItems,
  sumitDocType,
  type SumitDoc,
} from "./sumit";

// ---------------------------------------------------------------------------
// סנכרון SUMIT → CRM — הצעות מחיר בלבד. כל הצעה חדשה (14 יום אחרונים) מיובאת
// למודול ההצעות ומשויכת ללקוח קיים (מזהה-SUMIT → שם → מייל). לקוח חדש
// לא נפתח מהסנכרון — רק כשההצעה עוברת ל"אושרה" (החלטת הבעלים 2026-08-31).
// סנכרון מסמכים פיננסיים (חשבוניות/קבלות) — כבוי לבקשת המשרד.
// ---------------------------------------------------------------------------

export interface SumitSyncResult {
  documentsSeen: number;
  documentsLinked: number; // תמיד 0 — סנכרון פיננסי כבוי
  quotesLinked: number;
  clientsMatched: number;
  clientsCreated: number;
  emailLookups: number;
  invoicesSeen: number; // חשבוניות מס בחלון
  invoicesApplied: number; // חשבוניות שהוחלו על לוח התשלומים בהרצה זו
  invoicesUnmatched: number; // חשבוניות ללא לקוח תואם
}

const QUOTE_WINDOW_DAYS = 14; // מייבאים הצעות מחיר רק מהחלון האחרון
const INVOICE_WINDOW_DAYS = 400; // חשבוניות מס למילוי לוח התשלומים (שנה נוכחית + קודמת חלקית)
const INVOICE_MAX_PER_RUN = 40; // תקרת getdetails להרצה — השאר נאספים בהרצות הבאות

function normName(s: string): string {
  return (s || "").trim().replace(/\s+/g, " ").toLowerCase();
}

// כל הסכומים במערכת הם ללא מע"מ (החלטת הבעלים 2026-08-31) — SUMIT מחזיר
// סכומי מסמכים ברוטו, ולכן מפשיטים 18% מע"מ (חלוקה ב-1.18) בכל ייבוא.
const VAT_RATE = 1.18;
const exVat = (n: number): number => n / VAT_RATE;

// סנכרון אוטומטי כל ~15 דקות — רוכב על מנוע התזכורות (שרץ כל ~5 דקות).
// מריצים ב-5 הדקות הראשונות של כל רבע שעה → הצעה חדשה מופיעה תוך ~15 דק'.
export async function maybeAutoSyncSumit(force = false): Promise<SumitSyncResult | null> {
  if (!sumitConfigured()) return null;
  if (!force) {
    const minuteIL = Number(
      new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Jerusalem", minute: "2-digit" }).format(new Date())
    );
    if (minuteIL % 15 >= 5) return null; // רק בתחילת כל רבע שעה
  }
  return syncSumit();
}

export async function syncSumit(): Promise<SumitSyncResult> {
  if (!sumitConfigured()) throw new Error("SUMIT לא מוגדר");

  const docs = await sumitListDocuments();
  const result: SumitSyncResult = {
    documentsSeen: docs.length,
    documentsLinked: 0,
    quotesLinked: 0,
    clientsMatched: 0,
    clientsCreated: 0,
    emailLookups: 0,
    invoicesSeen: 0,
    invoicesApplied: 0,
    invoicesUnmatched: 0,
  };
  if (docs.length === 0) return result;

  const clients = await prisma.client.findMany({
    select: { id: true, name: true, contactEmail: true, sumitCustomerId: true },
  });
  const bySumitId = new Map<number, string>();
  const byEmail = new Map<string, string>();
  const byName = new Map<string, string>();
  for (const c of clients) {
    if (c.sumitCustomerId) bySumitId.set(c.sumitCustomerId, c.id);
    if (c.contactEmail) byEmail.set(c.contactEmail.toLowerCase().trim(), c.id);
    if (c.name) byName.set(normName(c.name), c.id);
  }

  const existingQuotes = await prisma.quote.findMany({
    where: { notes: { contains: "[sumit:" } },
    select: { notes: true },
  });
  const haveQuote = new Set<string>();
  for (const q of existingQuotes) {
    const m = q.notes?.match(/\[sumit:(\d+)\]/);
    if (m) haveQuote.add(m[1]);
  }

  const matchedClients = new Set<string>();
  const cutoff = new Date(Date.now() - QUOTE_WINDOW_DAYS * 24 * 60 * 60 * 1000);

  // הצעות מחיר מהחלון האחרון → מודול ההצעות + שיוך/פתיחת לקוח.
  for (const d of docs) {
    if (sumitDocType(d.Type).category !== "proposal") continue;
    if (!d.Date || new Date(d.Date) < cutoff) continue;
    if (haveQuote.has(String(d.DocumentID))) continue;

    const { clientId, created } = await resolveOrCreateClient(d, {
      bySumitId,
      byEmail,
      byName,
      onLookup: () => result.emailLookups++,
    });
    if (clientId) matchedClients.add(clientId);
    if (created) result.clientsCreated++;
    await createQuoteFromSumit(clientId, d);
    result.quotesLinked++;
  }

  result.clientsMatched = matchedClients.size;

  // מעבר חשבוניות מס → מילוי אוטומטי של לוח התשלומים.
  await syncSumitInvoices(docs, { bySumitId, byEmail, byName }, result);

  return result;
}

type ClientMaps = {
  bySumitId: Map<number, string>;
  byEmail: Map<string, string>;
  byName: Map<string, string>;
};

// התאמת לקוח קיים בלבד (ללא פתיחת לקוח חדש — פתיחה נעשית רק מהצעות מחיר).
async function matchClientOnly(d: SumitDoc, maps: ClientMaps, result: SumitSyncResult): Promise<string | null> {
  const byId = maps.bySumitId.get(d.CustomerID);
  if (byId) return byId;
  if (d.CustomerName) {
    const byNm = maps.byName.get(normName(d.CustomerName));
    if (byNm) {
      await linkSumitId(byNm, d.CustomerID, maps);
      return byNm;
    }
  }
  result.emailLookups++;
  const cust = await sumitDocumentCustomer(d.DocumentID);
  if (cust?.email) {
    const byMail = maps.byEmail.get(cust.email);
    if (byMail) {
      await linkSumitId(byMail, d.CustomerID, maps);
      return byMail;
    }
  }
  return null;
}

// סיווג שורות חשבונית לריטיינר/חד-פעמי לפי מילות המפתח (התאמת מחרוזת בתיאור).
function classifyShares(
  items: { description: string; amount: number }[],
  kw: { retainer: string[]; oneoff: string[] }
): { r: number; o: number } {
  let r = 0;
  let o = 0;
  for (const it of items) {
    const amt = it.amount || 0;
    if (amt <= 0) continue;
    const text = it.description.toLowerCase();
    const isOne = kw.oneoff.some((k) => k && text.includes(k));
    const isRet = kw.retainer.some((k) => k && text.includes(k));
    if (isOne) o += amt; // חד-פעמי גובר (פריט ספציפי)
    else if (isRet) r += amt;
    else r += amt; // ללא התאמה → ברירת מחדל ריטיינר
  }
  return { r, o };
}

async function upsertSumitAmount(
  clientId: string,
  year: number,
  month: number,
  kind: "retainer" | "oneoff",
  sum: number
) {
  const sumitAmount = sum > 0 ? Math.round(sum) : null;
  await prisma.clientPayment
    .upsert({
      where: { clientId_year_month_kind: { clientId, year, month, kind } },
      update: { sumitAmount },
      create: { clientId, year, month, kind, sumitAmount },
    })
    .catch(() => {});
}

// מילוי לוח התשלומים מחשבוניות מס (Type 0/1). כל חשבונית מעובדת פעם אחת
// (SumitInvoice), והתא מחושב מחדש כסכום כל החשבוניות שלו — כך 2 חשבוניות
// באותו חודש מסתכמות לתא אחד, ואין ספירה כפולה בהרצות חוזרות.
async function syncSumitInvoices(docs: SumitDoc[], maps: ClientMaps, result: SumitSyncResult): Promise<void> {
  const cutoff = new Date(Date.now() - INVOICE_WINDOW_DAYS * 24 * 60 * 60 * 1000);
  const invoices = docs.filter((d) => {
    const cat = sumitDocType(d.Type).category;
    return (cat === "tax_invoice" || cat === "tax_invoice_receipt") && d.Date && new Date(d.Date) >= cutoff;
  });
  result.invoicesSeen = invoices.length;
  if (invoices.length === 0) return;

  const appliedRows = await prisma.sumitInvoice.findMany({ select: { documentID: true } });
  const applied = new Set(appliedRows.map((a) => a.documentID));
  const todo = invoices.filter((d) => !applied.has(d.DocumentID)).slice(0, INVOICE_MAX_PER_RUN);
  if (todo.length === 0) return;

  const kwRows = await prisma.paymentKeyword.findMany({ select: { keyword: true, kind: true } });
  const kw = {
    retainer: kwRows.filter((k) => k.kind === "retainer").map((k) => k.keyword.toLowerCase().trim()).filter(Boolean),
    oneoff: kwRows.filter((k) => k.kind === "oneoff").map((k) => k.keyword.toLowerCase().trim()).filter(Boolean),
  };

  const touched = new Set<string>(); // clientId:year:month

  for (const d of todo) {
    const dt = new Date(d.Date);
    const year = dt.getFullYear();
    const month = dt.getMonth() + 1;
    const clientId = await matchClientOnly(d, maps, result);

    if (!clientId) {
      // מסמנים כמעובד (clientId ריק) כדי לא לקרוא getdetails שוב בכל הרצה
      await prisma.sumitInvoice
        .create({ data: { documentID: d.DocumentID, clientId: "", year, month } })
        .catch(() => {});
      result.invoicesUnmatched++;
      continue;
    }

    const docValue = d.DocumentValue || 0;
    let retainerAmt = 0;
    let oneoffAmt = 0;
    if (docValue > 0) {
      const items = await sumitDocumentItems(d.DocumentID);
      const { r, o } = classifyShares(items, kw);
      const tot = r + o;
      if (tot > 0) {
        // יחס הפריטים מוחל על סכום החשבונית, והתוצאה נשמרת נטו (ללא מע"מ).
        retainerAmt = exVat((docValue * r) / tot);
        oneoffAmt = exVat((docValue * o) / tot);
      } else {
        retainerAmt = exVat(docValue); // ללא פריטים → הכל ריטיינר
      }
    }

    await prisma.sumitInvoice
      .create({ data: { documentID: d.DocumentID, clientId, year, month, retainer: retainerAmt, oneoff: oneoffAmt } })
      .catch(() => {});
    touched.add(`${clientId}:${year}:${month}`);
    result.invoicesApplied++;
  }

  // חישוב מחדש של התאים שנגעו בהם — סכום כל החשבוניות של אותו לקוח/חודש.
  for (const key of touched) {
    const [clientId, yStr, mStr] = key.split(":");
    const year = Number(yStr);
    const month = Number(mStr);
    const rows = await prisma.sumitInvoice.findMany({
      where: { clientId, year, month },
      select: { retainer: true, oneoff: true },
    });
    const rSum = rows.reduce((s, x) => s + x.retainer, 0);
    const oSum = rows.reduce((s, x) => s + x.oneoff, 0);
    await upsertSumitAmount(clientId, year, month, "retainer", rSum);
    await upsertSumitAmount(clientId, year, month, "oneoff", oSum);
  }
}

// התאמת לקוח: מזהה-SUMIT → שם → מייל; אחרת פתיחת לקוח חדש מפרטי ההצעה.
async function resolveOrCreateClient(
  d: SumitDoc,
  maps: {
    bySumitId: Map<number, string>;
    byEmail: Map<string, string>;
    byName: Map<string, string>;
    onLookup: () => void;
  }
): Promise<{ clientId: string | null; created: boolean }> {
  // 1. לפי מזהה-SUMIT (הכי אמין; מונע כפילויות בסנכרונים הבאים)
  const byId = maps.bySumitId.get(d.CustomerID);
  if (byId) return { clientId: byId, created: false };

  // 2. לפי שם הלקוח בהצעה
  if (d.CustomerName) {
    const byNm = maps.byName.get(normName(d.CustomerName));
    if (byNm) {
      await linkSumitId(byNm, d.CustomerID, maps);
      return { clientId: byNm, created: false };
    }
  }

  // 3. משיכת פרטי הלקוח מ-SUMIT (מייל/טלפון/שם) — להתאמה לפי מייל / לפתיחה
  maps.onLookup();
  const cust = await sumitDocumentCustomer(d.DocumentID);
  if (cust?.email) {
    const byMail = maps.byEmail.get(cust.email);
    if (byMail) {
      await linkSumitId(byMail, d.CustomerID, maps);
      return { clientId: byMail, created: false };
    }
  }

  // 4. התאמה ללקוח קיים לפי שם — אבל בלי לפתוח לקוח חדש: החלטת הבעלים
  // (2026-08-31) — לקוח נפתח במערכת (ומופיע בלוח התשלומים) רק כשההצעה
  // עוברת ל"אושרה" (מסלול quotes/[id]/approve). עד אז ההצעה נשארת ללא לקוח.
  const name = (d.CustomerName || cust?.name || "").trim();
  if (!name) return { clientId: null, created: false };
  const existing = await prisma.client.findFirst({ where: { name }, select: { id: true } });
  if (existing) {
    await linkSumitId(existing.id, d.CustomerID, maps);
    return { clientId: existing.id, created: false };
  }
  return { clientId: null, created: false };
}

async function linkSumitId(
  clientId: string,
  sumitCustomerId: number,
  maps: { bySumitId: Map<number, string> }
) {
  maps.bySumitId.set(sumitCustomerId, clientId);
  await prisma.client.update({ where: { id: clientId }, data: { sumitCustomerId } }).catch(() => {});
}

async function createQuoteFromSumit(clientId: string | null, d: SumitDoc) {
  const label = sumitDocType(d.Type).label;
  await prisma.quote
    .create({
      data: {
        clientId,
        recipient: d.CustomerName || "מתעניין",
        title: d.DocumentNumber ? `${label} #${d.DocumentNumber}` : label,
        amount: d.DocumentValue ? Math.round(exVat(d.DocumentValue)) : null,
        status: "sent",
        sentAt: d.Date ? new Date(d.Date) : new Date(),
        notes: `יובא מ-SUMIT [sumit:${d.DocumentID}]`,
      },
    })
    .catch(() => {});
}
