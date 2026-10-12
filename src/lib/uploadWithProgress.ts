import { api } from "./fetcher";

// ---------------------------------------------------------------------------
// העלאת קובץ עם מד התקדמות אמיתי (אחוזים) — דרך XMLHttpRequest, כי fetch לא
// חושף אירועי התקדמות העלאה. קטן (<3.5MB) נשלח לשרת; גדול (עד 100MB) ישירות
// ל-R2 עם presign. onProgress מקבל אחוז 0–100 של העלאת הבייטים בפועל.
// ---------------------------------------------------------------------------

const SERVER_LIMIT = 3_500_000;

function xhrSend(
  method: string,
  url: string,
  body: XMLHttpRequestBodyInit,
  headers: Record<string, string> | undefined,
  onProgress: (pct: number) => void
): Promise<{ status: number; responseText: string }> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open(method, url, true);
    if (headers) for (const [k, v] of Object.entries(headers)) xhr.setRequestHeader(k, v);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(Math.min(99, Math.round((e.loaded / e.total) * 100)));
    };
    xhr.onload = () => resolve({ status: xhr.status, responseText: xhr.responseText });
    xhr.onerror = () => reject(new Error("שגיאת רשת בהעלאה"));
    xhr.onabort = () => reject(new Error("ההעלאה בוטלה"));
    xhr.send(body);
  });
}

export async function uploadFileWithProgress(
  file: File,
  opts: { clientId?: string; category: string },
  onProgress: (pct: number) => void
): Promise<{ key: string; fileName: string; mimeType: string | null }> {
  onProgress(0);
  if (file.size > SERVER_LIMIT) {
    // קובץ גדול — presign ואז PUT ישיר ל-R2 עם מעקב התקדמות.
    const pres = await api<{ target: { url: string; headers: Record<string, string> }; key: string }>(
      "/api/uploads/presign",
      {
        method: "POST",
        json: {
          ...(opts.clientId ? { clientId: opts.clientId } : {}),
          category: opts.category,
          fileName: file.name,
          mimeType: file.type || "application/octet-stream",
          size: file.size,
        },
      }
    );
    const res = await xhrSend("PUT", pres.target.url, file, pres.target.headers, onProgress);
    if (res.status < 200 || res.status >= 300) throw new Error(`העלאת "${file.name}" נכשלה`);
    onProgress(100);
    return { key: pres.key, fileName: file.name, mimeType: file.type || null };
  }
  // קובץ קטן — דרך השרת (multipart) עם מעקב התקדמות.
  const fd = new FormData();
  fd.append("file", file);
  fd.append("category", opts.category);
  if (opts.clientId) fd.append("clientId", opts.clientId);
  const res = await xhrSend("POST", "/api/uploads/direct", fd, undefined, onProgress);
  let uj: any = {};
  try {
    uj = JSON.parse(res.responseText);
  } catch {
    /* ריק */
  }
  if (res.status < 200 || res.status >= 300) throw new Error(uj.error || `העלאת "${file.name}" נכשלה`);
  onProgress(100);
  return { key: uj.key, fileName: uj.fileName, mimeType: uj.mimeType ?? null };
}

export interface UploadRow {
  id: string;
  name: string;
  pct: number;
  status: "uploading" | "finalizing" | "done" | "error";
  error?: string;
}

export function newUploadId(): string {
  return Math.random().toString(36).slice(2, 10);
}
