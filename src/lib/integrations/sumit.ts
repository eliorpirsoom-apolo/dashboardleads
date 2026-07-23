// ---------------------------------------------------------------------------
// SUMIT (OfficeGuy) — חשבוניות/קבלות/הצעות מחיר. חשבון ברמת המשרד;
// אימות דרך Credentials{CompanyID, APIKey} בגוף כל בקשה. השרת בלבד.
// ---------------------------------------------------------------------------

const SUMIT_BASE = "https://api.sumit.co.il";

export function sumitConfigured(): boolean {
  return Boolean(process.env.SUMIT_COMPANY_ID && process.env.SUMIT_API_KEY);
}

export interface SumitResult<T = unknown> {
  status: number;
  ok: boolean;
  data: T | null;
  error: string | null;
}

/** קריאה גנרית ל-SUMIT: מזריק Credentials לגוף ה-JSON. */
export async function sumitCall<T = any>(
  path: string,
  body: Record<string, unknown> = {}
): Promise<SumitResult<T>> {
  if (!sumitConfigured()) {
    return { status: 0, ok: false, data: null, error: "SUMIT לא מוגדר" };
  }
  const url = `${SUMIT_BASE}${path.startsWith("/") ? path : `/${path}`}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      Credentials: {
        CompanyID: Number(process.env.SUMIT_COMPANY_ID),
        APIKey: process.env.SUMIT_API_KEY,
      },
      ...body,
    }),
  });
  let json: any = null;
  try {
    json = await res.json();
  } catch {
    /* לא JSON */
  }
  // SUMIT מחזיר { Status, UserErrorMessage, Data }.
  return {
    status: res.status,
    ok: Boolean(json ? json.Status === 0 : res.ok),
    data: (json?.Data ?? json) as T,
    error: json?.UserErrorMessage ?? (res.ok ? null : `HTTP ${res.status}`),
  };
}

// --- סוגי מסמכים ב-SUMIT → קטגוריה + תווית עברית --------------------------
// (enum OfficeGuy; type 1 = חשבונית מס/קבלה בחשבון הזה. קל לעדכן.)
export const SUMIT_DOC_TYPES: Record<number, { category: string; label: string }> = {
  1: { category: "tax_invoice_receipt", label: "חשבונית מס/קבלה" },
  2: { category: "tax_invoice", label: "חשבונית מס" },
  3: { category: "receipt", label: "קבלה" },
  4: { category: "credit_invoice", label: "חשבונית זיכוי" },
  5: { category: "donation_receipt", label: "קבלה על תרומה" },
  8: { category: "proforma", label: "חשבון עסקה" },
  9: { category: "payment_request", label: "דרישת תשלום" },
  10: { category: "order", label: "הזמנה" },
  11: { category: "proposal", label: "הצעת מחיר" },
};

export function sumitDocType(type: number): { category: string; label: string } {
  return SUMIT_DOC_TYPES[type] ?? { category: "financial_other", label: `מסמך (${type})` };
}

export interface SumitDoc {
  DocumentID: number;
  DocumentNumber: number;
  Type: number;
  Date: string;
  CustomerID: number;
  CustomerName: string;
  DocumentValue: number;
  DocumentDownloadURL: string;
}

/** כל המסמכים בחשבון. מדפדף, אך עוצר גם אם עמוד לא מחזיר מסמכים חדשים
 *  (הגנה מפני API שמתעלם מפרמטר הדף ומחזיר את אותו עמוד). דדופ לפי DocumentID. */
export async function sumitListDocuments(maxPages = 50): Promise<SumitDoc[]> {
  const seen = new Set<number>();
  const out: SumitDoc[] = [];
  for (let page = 1; page <= maxPages; page++) {
    const r = await sumitCall<{ Documents: SumitDoc[]; HasNextPage: boolean }>(
      "/accounting/documents/list/",
      { Page: page, PageSize: 100 }
    );
    const batch = r.data?.Documents ?? [];
    if (!r.ok || batch.length === 0) break;
    let added = 0;
    for (const d of batch) {
      if (!seen.has(d.DocumentID)) {
        seen.add(d.DocumentID);
        out.push(d);
        added++;
      }
    }
    // עמוד ללא מסמכים חדשים = ה-API לא מדפדף → עצירה.
    if (added === 0) break;
    if (r.data && r.data.HasNextPage === false) break;
  }
  return out;
}

/** פרטי מסמך — כולל אימייל הלקוח (למיפוי לפי מייל). */
export async function sumitDocumentEmail(documentID: number): Promise<string | null> {
  const r = await sumitCall<{ Document?: { Customer?: { EmailAddress?: string } } }>(
    "/accounting/documents/getdetails/",
    { DocumentID: documentID }
  );
  return r.data?.Document?.Customer?.EmailAddress?.toLowerCase().trim() || null;
}
