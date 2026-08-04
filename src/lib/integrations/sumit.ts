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
// enum רשמי מה-Swagger: Accounting_Typed_DocumentType.
export const SUMIT_DOC_TYPES: Record<number, { category: string; label: string }> = {
  0: { category: "tax_invoice", label: "חשבונית מס" },
  1: { category: "tax_invoice_receipt", label: "חשבונית מס/קבלה" },
  2: { category: "receipt", label: "קבלה" },
  3: { category: "proforma", label: "חשבון עסקה (פרופורמה)" },
  4: { category: "donation_receipt", label: "קבלה על תרומה" },
  5: { category: "credit_invoice", label: "חשבונית זיכוי" },
  6: { category: "credit_invoice_receipt", label: "זיכוי מס/קבלה" },
  7: { category: "credit_receipt", label: "קבלת זיכוי" },
  8: { category: "order", label: "הזמנה" },
  9: { category: "delivery_note", label: "תעודת משלוח" },
  10: { category: "goods_return", label: "תעודת החזרה" },
  11: { category: "purchase_order", label: "הזמנת רכש" },
  12: { category: "proposal", label: "הצעת מחיר" },
  13: { category: "payment_request", label: "דרישת תשלום" },
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

/** כל המסמכים בחשבון (כולל טיוטות/הצעות). דפדוף נכון לפי הסכמה הרשמית:
 *  Paging{StartIndex,PageSize} + IncludeDrafts. דדופ לפי DocumentID. */
export async function sumitListDocuments(includeDrafts = true): Promise<SumitDoc[]> {
  const PAGE = 100;
  const seen = new Set<number>();
  const out: SumitDoc[] = [];
  for (let start = 0; start < 10000; start += PAGE) {
    const r = await sumitCall<{ Documents: SumitDoc[] }>("/accounting/documents/list/", {
      IncludeDrafts: includeDrafts,
      Paging: { StartIndex: start, PageSize: PAGE },
    });
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
    if (added === 0 || batch.length < PAGE) break;
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

/** פרטי הלקוח המלאים מהמסמך (שם/מייל/טלפון) — לפתיחת לקוח חדש מהצעת מחיר. */
export async function sumitDocumentCustomer(
  documentID: number
): Promise<{ name: string | null; email: string | null; phone: string | null } | null> {
  const r = await sumitCall<{ Document?: { Customer?: Record<string, any> } }>(
    "/accounting/documents/getdetails/",
    { DocumentID: documentID }
  );
  const c = r.data?.Document?.Customer;
  if (!c) return null;
  const email = String(c.EmailAddress || c.Email || "").toLowerCase().trim() || null;
  const phone = String(c.Phone || c.PhoneNumber || c.Mobile || c.TelephoneNumber || "").trim() || null;
  const name = String(c.Name || c.CompanyName || c.ContactPersonName || "").trim() || null;
  return { name, email, phone };
}
