import { api } from "./fetcher";

// העלאת מדיה מוטבעת בבריף/עדכוני סטודיו (תמונה/וידאו/צילום-מסך שהודבק) →
// R2 → קישור להגשה מאובטחת (/api/studio/media). קטגוריה "studio-brief" =
// namespace של המשרד ללא תלות בלקוח, כדי שהדבקה תעבוד מיד (גם לפני שנבחר
// לקוח לבריף). קבצים קטנים דרך ה-API; גדולים (וידאו) ישירות ל-R2 עם presign.
// משותף לעורך הבריף בכרטיס (StudioTaskDrawer) וביצירת בריף חדש (StudioBoard).
export async function uploadStudioMedia(file: File): Promise<string | null> {
  if (file.size > 3_500_000) {
    const pres = await api<{ target: { url: string; method: string; headers: Record<string, string> }; key: string }>(
      "/api/uploads/presign",
      {
        method: "POST",
        json: {
          category: "studio-brief",
          fileName: file.name || "paste.png",
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
  fd.append("file", file, file.name || "paste.png");
  fd.append("category", "studio-brief");
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
