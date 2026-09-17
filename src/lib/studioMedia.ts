import { api } from "./fetcher";

// העלאת מדיה מוטבעת בבריף/עדכוני סטודיו (תמונה/וידאו/צילום-מסך שהודבק) →
// R2 → קישור להגשה מאובטחת (/api/studio/media). קבצים קטנים דרך ה-API,
// גדולים (וידאו) ישירות ל-R2 עם presign — עוקף את מגבלת ה-4MB של Vercel.
// משותף לעורך הבריף בכרטיס (StudioTaskDrawer) וביצירת בריף חדש (StudioBoard).
export async function uploadStudioMedia(clientId: string, file: File): Promise<string | null> {
  if (!clientId) throw new Error("בחרו קודם לקוח כדי לצרף תמונות לבריף");
  if (file.size > 3_500_000) {
    const pres = await api<{ target: { url: string; method: string; headers: Record<string, string> }; key: string }>(
      "/api/uploads/presign",
      {
        method: "POST",
        json: {
          clientId,
          category: "design",
          fileName: file.name,
          mimeType: file.type || "application/octet-stream",
          size: file.size,
        },
      }
    );
    const put = await fetch(pres.target.url, { method: "PUT", headers: pres.target.headers, body: file });
    if (!put.ok) throw new Error("העלאת הקובץ נכשלה");
    return `/api/studio/media?key=${encodeURIComponent(pres.key)}`;
  }
  const fd = new FormData();
  fd.append("file", file);
  fd.append("category", "design");
  fd.append("clientId", clientId);
  const up = await fetch("/api/uploads/direct", { method: "POST", body: fd });
  const uj = await up.json();
  if (!up.ok) throw new Error(uj.error || "העלאת הקובץ נכשלה");
  return `/api/studio/media?key=${encodeURIComponent(uj.key)}`;
}

// חילוץ טקסט גולמי מ-HTML של בריף (ל-AI) + שמירת תגי התמונות/וידאו להחזרה.
export function splitBriefHtml(html: string): { text: string; media: string } {
  const media = (html.match(/<(img|video)\b[^>]*>(?:<\/video>)?/gi) || []).join("");
  const text = html
    .replace(/<(img|video)\b[^>]*>(?:<\/video>)?/gi, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return { text, media };
}
