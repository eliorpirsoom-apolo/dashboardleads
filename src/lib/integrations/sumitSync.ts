import { prisma } from "@/lib/prisma";
import {
  sumitConfigured,
  sumitListDocuments,
  sumitDocumentCustomer,
  sumitDocType,
  type SumitDoc,
} from "./sumit";

// ---------------------------------------------------------------------------
// סנכרון SUMIT → CRM — הצעות מחיר בלבד. כל הצעה חדשה (14 יום אחרונים) מיובאת
// למודול ההצעות ומשויכת ללקוח: התאמה לפי מזהה-SUMIT → שם → מייל; ואם אין לקוח
// מתאים — נפתח לקוח חדש עם הפרטים מ-SUMIT (שם/טלפון/מייל).
// סנכרון מסמכים פיננסיים (חשבוניות/קבלות) — כבוי לבקשת המשרד.
// ---------------------------------------------------------------------------

export interface SumitSyncResult {
  documentsSeen: number;
  documentsLinked: number; // תמיד 0 — סנכרון פיננסי כבוי
  quotesLinked: number;
  clientsMatched: number;
  clientsCreated: number;
  emailLookups: number;
}

const QUOTE_WINDOW_DAYS = 14; // מייבאים הצעות מחיר רק מהחלון האחרון

function normName(s: string): string {
  return (s || "").trim().replace(/\s+/g, " ").toLowerCase();
}

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
  return result;
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

  // 4. פתיחת לקוח חדש
  const name = (d.CustomerName || cust?.name || "").trim();
  if (!name) return { clientId: null, created: false };
  // שם ייחודי — אם כבר קיים לקוח בשם הזה, נשייך אליו
  const existing = await prisma.client.findFirst({ where: { name }, select: { id: true } });
  if (existing) {
    await linkSumitId(existing.id, d.CustomerID, maps);
    return { clientId: existing.id, created: false };
  }
  const c = await prisma.client
    .create({
      data: {
        name,
        company: name,
        contactPhone: cust?.phone || null,
        contactEmail: cust?.email || null,
        sumitCustomerId: d.CustomerID,
        notes: "נוצר אוטומטית מהצעת מחיר ב-SUMIT",
      },
      select: { id: true },
    })
    .catch(() => null);
  if (!c) return { clientId: null, created: false };
  maps.bySumitId.set(d.CustomerID, c.id);
  maps.byName.set(normName(name), c.id);
  if (cust?.email) maps.byEmail.set(cust.email, c.id);
  return { clientId: c.id, created: true };
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
        amount: d.DocumentValue || null,
        status: "sent",
        sentAt: d.Date ? new Date(d.Date) : new Date(),
        notes: `יובא מ-SUMIT [sumit:${d.DocumentID}]`,
      },
    })
    .catch(() => {});
}
