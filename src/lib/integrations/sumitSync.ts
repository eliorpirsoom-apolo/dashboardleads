import { prisma } from "@/lib/prisma";
import {
  sumitConfigured,
  sumitListDocuments,
  sumitDocumentEmail,
  sumitDocType,
  type SumitDoc,
} from "./sumit";

// ---------------------------------------------------------------------------
// סנכרון SUMIT → CRM. עמיד לזמן ריצה (מגבלת 60 שניות): הצעות מחיר מיובאות
// ראשונות ובלי קריאות רשת נוספות; מסמכים פיננסיים מותאמים לפי מייל עם
// תקציב getdetails מוגבל (מתכנס על פני כמה סנכרונים, עם מטמון sumitCustomerId).
// ---------------------------------------------------------------------------

export interface SumitSyncResult {
  documentsSeen: number;
  documentsLinked: number;
  quotesLinked: number;
  clientsMatched: number;
  emailLookups: number;
}

const GETDETAILS_BUDGET = 25; // מגבלת קריאות getdetails לריצה
const QUOTE_WINDOW_DAYS = 14; // מייבאים הצעות מחיר רק מהחלון האחרון

// סנכרון אוטומטי פעם בשעה — רוכב על מנוע התזכורות (שרץ כל 5 דקות).
// מריצים רק כשהדקה בישראל היא 0–4, כך שבדיוק הרצה אחת בשעה מבצעת סנכרון.
// כך מסמך שמונפק ב-SUMIT מופיע בדשבורד תוך שעה, בלי הגדרה חיצונית נוספת.
export async function maybeAutoSyncSumit(
  force = false
): Promise<SumitSyncResult | null> {
  if (!sumitConfigured()) return null;
  if (!force) {
    const minuteIL = Number(
      new Intl.DateTimeFormat("en-GB", {
        timeZone: "Asia/Jerusalem",
        minute: "2-digit",
      }).format(new Date())
    );
    if (minuteIL >= 5) return null; // רק בתחילת כל שעה
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
    emailLookups: 0,
  };
  if (docs.length === 0) return result;

  const clients = await prisma.client.findMany({
    select: { id: true, contactEmail: true, sumitCustomerId: true },
  });
  const bySumitId = new Map<number, string>();
  const byEmail = new Map<string, string>();
  for (const c of clients) {
    if (c.sumitCustomerId) bySumitId.set(c.sumitCustomerId, c.id);
    if (c.contactEmail) byEmail.set(c.contactEmail.toLowerCase().trim(), c.id);
  }

  // טעינה מקדימה: מה שכבר קיים — כדי לא לפנות ל-DB פר-מסמך.
  const existingDocs = await prisma.document.findMany({
    where: { provider: "sumit" },
    select: { externalId: true },
  });
  const haveDoc = new Set(existingDocs.map((d) => d.externalId));
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

  // ניקוי הצעות SUMIT ישנות שיובאו אוטומטית וטרם טופלו (מחוץ לחלון).
  await prisma.quote.deleteMany({
    where: {
      notes: { contains: "[sumit:" },
      status: { in: ["sent", "followup"] },
      sentAt: { lt: cutoff },
    },
  });

  // --- Pass 1: הצעות מחיר מ-14 הימים האחרונים → מודול ההצעות ---
  for (const d of docs) {
    if (sumitDocType(d.Type).category !== "proposal") continue;
    if (!d.Date || new Date(d.Date) < cutoff) continue; // רק חלון אחרון
    const key = String(d.DocumentID);
    if (haveQuote.has(key)) continue;
    const clientId = bySumitId.get(d.CustomerID) ?? null;
    if (clientId) matchedClients.add(clientId);
    await createQuoteFromSumit(clientId, d);
    result.quotesLinked++;
  }

  // --- Pass 2: מסמכים פיננסיים → דשבורד הלקוח (התאמת מייל בתקציב) ---
  const custToClient = new Map<number, string | null>();
  let budget = GETDETAILS_BUDGET;
  for (const d of docs) {
    const { category } = sumitDocType(d.Type);
    if (category === "proposal") continue;
    if (haveDoc.has(String(d.DocumentID))) continue;

    // פתרון לקוח לפי CustomerID (מטמון → getdetails מוגבל).
    let clientId: string | null;
    if (custToClient.has(d.CustomerID)) {
      clientId = custToClient.get(d.CustomerID)!;
    } else if (bySumitId.has(d.CustomerID)) {
      clientId = bySumitId.get(d.CustomerID)!;
      custToClient.set(d.CustomerID, clientId);
    } else if (budget > 0) {
      budget--;
      result.emailLookups++;
      const email = await sumitDocumentEmail(d.DocumentID);
      clientId = email ? byEmail.get(email) ?? null : null;
      custToClient.set(d.CustomerID, clientId);
      if (clientId) {
        await prisma.client
          .update({ where: { id: clientId }, data: { sumitCustomerId: d.CustomerID } })
          .catch(() => {});
      }
    } else {
      clientId = null; // תקציב מוצה — יטופל בסנכרון הבא
    }

    if (!clientId) continue;
    matchedClients.add(clientId);
    await createDocument(clientId, d);
    result.documentsLinked++;
  }

  result.clientsMatched = matchedClients.size;
  return result;
}

async function createDocument(clientId: string, d: SumitDoc) {
  const { category, label } = sumitDocType(d.Type);
  await prisma.document
    .create({
      data: {
        clientId,
        category,
        title: `${label} #${d.DocumentNumber}`,
        month: d.Date ? d.Date.slice(0, 7) : null,
        fileName: `${label} #${d.DocumentNumber}.pdf`,
        mimeType: "application/pdf",
        provider: "sumit",
        externalId: String(d.DocumentID),
        externalUrl: d.DocumentDownloadURL,
      },
    })
    .catch(() => {}); // התנגשות ייחודיות = כבר קיים
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
