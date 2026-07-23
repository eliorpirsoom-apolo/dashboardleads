import { prisma } from "@/lib/prisma";
import {
  sumitConfigured,
  sumitListDocuments,
  sumitDocumentEmail,
  sumitDocType,
  type SumitDoc,
} from "./sumit";

// ---------------------------------------------------------------------------
// סנכרון SUMIT → CRM: מסמכים פיננסיים לדשבורד הלקוח (לפי סוג) והצעות מחיר
// למודול ההצעות. התאמת לקוח לפי sumitCustomerId (מטמון) או מייל.
// ---------------------------------------------------------------------------

export interface SumitSyncResult {
  documentsSeen: number;
  documentsLinked: number;
  quotesLinked: number;
  clientsMatched: number;
  unmatchedCustomers: number;
}

export async function syncSumit(): Promise<SumitSyncResult> {
  if (!sumitConfigured()) throw new Error("SUMIT לא מוגדר");

  const docs = await sumitListDocuments();
  const result: SumitSyncResult = {
    documentsSeen: docs.length,
    documentsLinked: 0,
    quotesLinked: 0,
    clientsMatched: 0,
    unmatchedCustomers: 0,
  };
  if (docs.length === 0) return result;

  // מיפוי לקוחות ה-CRM: לפי sumitCustomerId ולפי מייל.
  const clients = await prisma.client.findMany({
    select: { id: true, contactEmail: true, sumitCustomerId: true },
  });
  const bySumitId = new Map<number, string>();
  const byEmail = new Map<string, string>();
  for (const c of clients) {
    if (c.sumitCustomerId) bySumitId.set(c.sumitCustomerId, c.id);
    if (c.contactEmail) byEmail.set(c.contactEmail.toLowerCase().trim(), c.id);
  }

  // פותרים כל CustomerID של SUMIT ל-clientId (מטמון מייל פר-לקוח).
  const customerIds = [...new Set(docs.map((d) => d.CustomerID))];
  const custToClient = new Map<number, string | null>();
  const matchedClientIds = new Set<string>();

  for (const cid of customerIds) {
    if (bySumitId.has(cid)) {
      const clientId = bySumitId.get(cid)!;
      custToClient.set(cid, clientId);
      matchedClientIds.add(clientId);
      continue;
    }
    // התאמה לפי מייל — דרך getdetails על מסמך אחד של הלקוח.
    const sample = docs.find((d) => d.CustomerID === cid);
    const email = sample ? await sumitDocumentEmail(sample.DocumentID) : null;
    const clientId = email ? byEmail.get(email) ?? null : null;
    custToClient.set(cid, clientId);
    if (clientId) {
      matchedClientIds.add(clientId);
      // שמירת ה-CustomerID על הלקוח כדי לחסוך getdetails בעתיד.
      await prisma.client
        .update({ where: { id: clientId }, data: { sumitCustomerId: cid } })
        .catch(() => {});
    } else {
      result.unmatchedCustomers++;
    }
  }
  result.clientsMatched = matchedClientIds.size;

  for (const d of docs) {
    const clientId = custToClient.get(d.CustomerID);
    if (!clientId) continue;
    const { category, label } = sumitDocType(d.Type);

    // מסמך פיננסי → טבלת Documents (dedupe לפי provider+externalId).
    await upsertDocument(clientId, d, category, label);
    result.documentsLinked++;

    // הצעת מחיר → מודול ההצעות.
    if (category === "proposal") {
      await upsertQuoteFromSumit(clientId, d, label);
      result.quotesLinked++;
    }
  }

  return result;
}

async function upsertDocument(
  clientId: string,
  d: SumitDoc,
  category: string,
  label: string
) {
  const externalId = String(d.DocumentID);
  const month = d.Date ? d.Date.slice(0, 7) : null;
  const title = `${label} #${d.DocumentNumber}`;
  const existing = await prisma.document.findFirst({
    where: { provider: "sumit", externalId },
  });
  if (existing) {
    await prisma.document.update({
      where: { id: existing.id },
      data: { externalUrl: d.DocumentDownloadURL, category, title, clientId },
    });
    return;
  }
  await prisma.document.create({
    data: {
      clientId,
      category,
      title,
      month,
      fileName: `${title}.pdf`,
      mimeType: "application/pdf",
      provider: "sumit",
      externalId,
      externalUrl: d.DocumentDownloadURL,
    },
  });
}

async function upsertQuoteFromSumit(clientId: string, d: SumitDoc, label: string) {
  // dedupe לפי סמן במקור בהערות (ה-PDF עצמו זמין דרך מסמך ההצעה).
  const marker = `[sumit:${d.DocumentID}]`;
  const existing = await prisma.quote.findFirst({ where: { notes: { contains: marker } } });
  const data = {
    clientId,
    recipient: d.CustomerName,
    title: `${label} #${d.DocumentNumber}`,
    amount: d.DocumentValue || null,
  };
  if (existing) {
    await prisma.quote.update({ where: { id: existing.id }, data });
  } else {
    await prisma.quote.create({
      data: {
        ...data,
        status: "sent",
        sentAt: d.Date ? new Date(d.Date) : new Date(),
        notes: `יובא מ-SUMIT ${marker}`,
      },
    });
  }
}
