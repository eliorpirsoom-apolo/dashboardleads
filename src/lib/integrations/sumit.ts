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
  const apiOk = res.ok && (json?.Status === 0 || json?.Status === "Success" || json == null ? res.ok : json?.Status === 0);
  return {
    status: res.status,
    ok: Boolean(json ? json.Status === 0 : res.ok),
    data: (json?.Data ?? json) as T,
    error: json?.UserErrorMessage ?? (res.ok ? null : `HTTP ${res.status}`),
  };
}
