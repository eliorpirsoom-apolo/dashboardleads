import sanitizeHtml from "sanitize-html";

// מסנן HTML עשיר (בריף/עדכונים) — מונע XSS, משאיר עיצוב בסיסי + תמונות + קישורים.
export function sanitizeRich(html: string): string {
  if (!html) return "";
  return sanitizeHtml(html, {
    allowedTags: [
      "p", "br", "strong", "b", "em", "i", "u", "s", "ul", "ol", "li",
      "a", "img", "h1", "h2", "h3", "blockquote", "code", "pre", "span",
    ],
    allowedAttributes: {
      a: ["href", "target", "rel"],
      img: ["src", "alt"],
    },
    allowedSchemes: ["http", "https", "mailto"],
    allowedSchemesByTag: { img: ["http", "https"] },
    // מאפשר נתיבים יחסיים (למשל /api/studio/media?key=...).
    allowProtocolRelative: false,
    transformTags: {
      a: sanitizeHtml.simpleTransform("a", { rel: "noopener noreferrer", target: "_blank" }),
    },
  });
}

// בדיקה אם התוכן ריק (אחרי הסרת תגיות ורווחים) — כדי לא לשמור עדכון/בריף ריק.
export function isRichEmpty(html: string): boolean {
  if (!html) return true;
  const text = sanitizeHtml(html, { allowedTags: [], allowedAttributes: {} }).replace(/\s|&nbsp;/g, "");
  // תוכן שהוא רק תמונה נחשב לא-ריק
  const hasImg = /<img\b/i.test(html);
  return text.length === 0 && !hasImg;
}
