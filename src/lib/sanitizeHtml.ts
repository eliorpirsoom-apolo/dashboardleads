import { FilterXSS } from "xss";

// מסנן HTML עשיר (בריף/עדכונים) — מונע XSS, משאיר עיצוב בסיסי + תמונות + קישורים.
// xss = ספרייה טהורה (CJS) ללא תלויות ESM — תקין ב-serverless.
const filter = new FilterXSS({
  whiteList: {
    p: [],
    br: [],
    strong: [],
    b: [],
    em: [],
    i: [],
    u: [],
    s: [],
    ul: [],
    ol: [],
    li: [],
    h1: [],
    h2: [],
    h3: [],
    blockquote: [],
    code: [],
    span: [],
    a: ["href", "target", "rel"],
    img: ["src", "alt"],
    video: ["src", "controls", "preload", "class"],
  },
  stripIgnoreTag: true,
  stripIgnoreTagBody: ["script", "style"],
  onTagAttr: (tag, name, value) => {
    if (tag === "a" && name === "href") {
      if (/^(https?:|mailto:)/i.test(value)) return `href="${value}"`;
      return "";
    }
    if ((tag === "img" || tag === "video") && name === "src") {
      // מאפשר נתיב יחסי (/api/studio/media...) או https בלבד
      if (/^\//.test(value) || /^https:/i.test(value)) return `src="${value}"`;
      return "";
    }
    return undefined; // ברירת מחדל של xss
  },
});

export function sanitizeRich(html: string): string {
  if (!html) return "";
  let out = filter.process(html);
  // הבטחת rel/target בקישורים
  out = out.replace(/<a /g, '<a rel="noopener noreferrer" target="_blank" ');
  return out;
}

// בדיקה אם התוכן ריק (אחרי הסרת תגיות ורווחים) — כדי לא לשמור עדכון/בריף ריק.
export function isRichEmpty(html: string): boolean {
  if (!html) return true;
  const hasMedia = /<img\b|<video\b/i.test(html);
  const text = html.replace(/<[^>]*>/g, "").replace(/&nbsp;|\s/g, "");
  return text.length === 0 && !hasMedia;
}
