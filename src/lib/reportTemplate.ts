import type {
  SeoMetric,
  SeoPageRow,
  SeoQueryRow,
  SeoReportData,
} from "./types";

// ---------------------------------------------------------------------------
// SEO report — HTML template (Hebrew / RTL)
//
// Pure string templating (no React) so it renders identically in Node for PDF
// generation. The markup is tuned for A4 print: explicit page padding, a muted
// palette, and `page-break` hints between major sections.
// ---------------------------------------------------------------------------

const BRAND = "#2563eb";
const GOOD = "#059669";
const BAD = "#dc2626";
const MUTED = "#6b7280";
const BORDER = "#e5e7eb";

// --- Formatting ------------------------------------------------------------

const nf = new Intl.NumberFormat("he-IL");

function num(n: number): string {
  return nf.format(Math.round(n));
}

function pct(n: number, digits = 1): string {
  return `${(n * 100).toFixed(digits)}%`;
}

function pos(n: number): string {
  return n.toFixed(1);
}

function dateHe(iso: string): string {
  return new Date(iso).toLocaleDateString("he-IL", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// Signed percentage badge with sentiment colour. `lowerIsBetter` flips meaning
// (e.g. average position improving = going down).
function deltaBadge(m: SeoMetric): string {
  if (m.deltaPercent === null || m.direction === "flat") {
    return `<span style="color:${MUTED};font-size:13px;">ללא שינוי</span>`;
  }
  const improved = m.lowerIsBetter ? m.direction === "down" : m.direction === "up";
  const color = improved ? GOOD : BAD;
  const arrow = m.direction === "up" ? "▲" : "▼";
  const sign = m.deltaPercent > 0 ? "+" : "";
  return `<span style="color:${color};font-size:13px;font-weight:600;">${arrow} ${sign}${m.deltaPercent.toFixed(1)}%</span>`;
}

function metricValue(m: SeoMetric): string {
  switch (m.key) {
    case "ctr":
      return pct(m.value);
    case "position":
      return pos(m.value);
    default:
      return num(m.value);
  }
}

// --- Auto executive summary -------------------------------------------------

function executiveSummary(data: SeoReportData): string {
  const clicks = data.summary.find((m) => m.key === "clicks");
  const position = data.summary.find((m) => m.key === "position");
  const parts: string[] = [];

  if (clicks) {
    if (clicks.deltaPercent === null) {
      parts.push(`התקופה כללה ${num(clicks.value)} קליקים אורגניים.`);
    } else if (clicks.direction === "up") {
      parts.push(
        `התנועה האורגנית עלתה ב-${clicks.deltaPercent.toFixed(0)}% והגיעה ל-${num(clicks.value)} קליקים בתקופה.`
      );
    } else if (clicks.direction === "down") {
      parts.push(
        `התנועה האורגנית ירדה ב-${Math.abs(clicks.deltaPercent).toFixed(0)}% ל-${num(clicks.value)} קליקים, ואנו פועלים להחזרת המגמה.`
      );
    } else {
      parts.push(`התנועה האורגנית נותרה יציבה על ${num(clicks.value)} קליקים.`);
    }
  }

  if (position && position.deltaPercent !== null && position.direction !== "flat") {
    if (position.direction === "down") {
      parts.push(`המיקום הממוצע השתפר ל-${pos(position.value)} (ככל שנמוך יותר — טוב יותר).`);
    } else {
      parts.push(`המיקום הממוצע נסוג מעט ל-${pos(position.value)}, ויעד מרכזי לחודש הבא הוא שיפורו.`);
    }
  }

  if (data.risingQueries.length) {
    parts.push(
      `${data.risingQueries.length} ביטויי חיפוש טיפסו במיקומים, ביניהם «${escapeHtml(
        data.risingQueries[0].query
      )}».`
    );
  }

  return parts.join(" ");
}

// --- Section builders -------------------------------------------------------

function kpiCards(metrics: SeoMetric[]): string {
  const cards = metrics
    .map(
      (m) => `
      <td style="width:25%;padding:6px;vertical-align:top;">
        <div style="border:1px solid ${BORDER};border-radius:10px;padding:14px 16px;background:#fff;">
          <div style="color:${MUTED};font-size:13px;margin-bottom:6px;">${m.label}</div>
          <div style="font-size:26px;font-weight:700;color:#111827;line-height:1.1;">${metricValue(m)}</div>
          <div style="margin-top:6px;">${deltaBadge(m)}</div>
        </div>
      </td>`
    )
    .join("");
  return `<table style="width:100%;border-collapse:collapse;table-layout:fixed;"><tr>${cards}</tr></table>`;
}

function th(label: string, align: "right" | "center" | "left" = "right"): string {
  return `<th style="padding:8px 10px;border-bottom:2px solid ${BORDER};text-align:${align};color:${MUTED};font-size:12px;font-weight:600;">${label}</th>`;
}

function td(content: string, align: "right" | "center" | "left" = "right", extra = ""): string {
  return `<td style="padding:8px 10px;border-bottom:1px solid #f1f5f9;text-align:${align};font-size:13px;${extra}">${content}</td>`;
}

function posDeltaCell(delta: number | null): string {
  if (delta === null) return td(`<span style="color:${MUTED};">חדש</span>`, "center");
  if (delta === 0) return td(`<span style="color:${MUTED};">—</span>`, "center");
  // Negative delta = improved position (moved up).
  const improved = delta < 0;
  const color = improved ? GOOD : BAD;
  const arrow = improved ? "▲" : "▼";
  return td(
    `<span style="color:${color};font-weight:600;">${arrow} ${Math.abs(delta).toFixed(1)}</span>`,
    "center"
  );
}

function queriesTable(rows: SeoQueryRow[]): string {
  const body = rows
    .map(
      (r) => `<tr>
        ${td(escapeHtml(r.query), "right", "font-weight:500;")}
        ${td(num(r.clicks))}
        ${td(num(r.impressions))}
        ${td(pct(r.ctr))}
        ${td(pos(r.position))}
      </tr>`
    )
    .join("");
  return `
  <table style="width:100%;border-collapse:collapse;">
    <thead><tr>
      ${th("ביטוי חיפוש")}${th("קליקים")}${th("חשיפות")}${th("CTR")}${th("מיקום")}
    </tr></thead>
    <tbody>${body || emptyRow(5)}</tbody>
  </table>`;
}

function moversTable(rows: SeoQueryRow[], kind: "rising" | "declining"): string {
  const body = rows
    .map(
      (r) => `<tr>
        ${td(escapeHtml(r.query), "right", "font-weight:500;")}
        ${td(pos(r.position))}
        ${posDeltaCell(r.positionDelta)}
      </tr>`
    )
    .join("");
  const title = kind === "rising" ? "📈 ביטויים שעלו במיקום" : "📉 ביטויים שירדו במיקום";
  return `
  <div style="width:48%;display:inline-block;vertical-align:top;">
    <h3 style="font-size:14px;margin:0 0 8px;color:#111827;">${title}</h3>
    <table style="width:100%;border-collapse:collapse;">
      <thead><tr>${th("ביטוי")}${th("מיקום")}${th("שינוי", "center")}</tr></thead>
      <tbody>${body || emptyRow(3)}</tbody>
    </table>
  </div>`;
}

function pagesTable(rows: SeoPageRow[]): string {
  const body = rows
    .map(
      (r) => `<tr>
        ${td(`<span dir="ltr" style="unicode-bidi:embed;">${escapeHtml(r.page)}</span>`, "right", "font-weight:500;")}
        ${td(num(r.clicks))}
        ${td(num(r.impressions))}
        ${td(pct(r.ctr))}
        ${td(pos(r.position))}
      </tr>`
    )
    .join("");
  return `
  <table style="width:100%;border-collapse:collapse;">
    <thead><tr>
      ${th("עמוד נחיתה")}${th("קליקים")}${th("חשיפות")}${th("CTR")}${th("מיקום")}
    </tr></thead>
    <tbody>${body || emptyRow(5)}</tbody>
  </table>`;
}

function emptyRow(cols: number): string {
  return `<tr><td colspan="${cols}" style="padding:16px;text-align:center;color:${MUTED};font-size:13px;">אין נתונים לתקופה זו</td></tr>`;
}

function sectionTitle(text: string): string {
  return `<h2 style="font-size:16px;color:${BRAND};border-bottom:2px solid ${BRAND};padding-bottom:6px;margin:28px 0 14px;">${text}</h2>`;
}

// --- Document ---------------------------------------------------------------

export function renderReportHtml(data: SeoReportData): string {
  const mockBanner = data.isMock
    ? `<div style="background:#fef3c7;border:1px solid #f59e0b;color:#92400e;padding:8px 12px;border-radius:8px;font-size:12px;margin-bottom:16px;">
         נתוני הדגמה — חברו את Search Console (משתני SC_SITE_URL ו-GOOGLE_SC_CREDENTIALS) לקבלת נתונים אמיתיים.
       </div>`
    : "";

  return `<!DOCTYPE html>
<html lang="he" dir="rtl">
<head>
<meta charset="utf-8" />
<style>
  @page { size: A4; margin: 16mm 14mm; }
  * { box-sizing: border-box; }
  body {
    font-family: "Heebo", "Rubik", "Segoe UI", Arial, sans-serif;
    color: #111827; margin: 0; font-size: 14px; line-height: 1.55;
    -webkit-print-color-adjust: exact; print-color-adjust: exact;
  }
  h1 { font-size: 24px; margin: 0; }
  table { font-variant-numeric: tabular-nums; }
  .section { page-break-inside: avoid; }
</style>
</head>
<body>
  <header style="display:flex;justify-content:space-between;align-items:flex-start;border-bottom:3px solid ${BRAND};padding-bottom:16px;margin-bottom:20px;">
    <div>
      <div style="color:${BRAND};font-weight:700;font-size:13px;letter-spacing:.5px;">דוח קידום אורגני בגוגל</div>
      <h1>${escapeHtml(data.clientName)}</h1>
      <div style="color:${MUTED};font-size:13px;margin-top:4px;">
        <span dir="ltr">${escapeHtml(data.siteUrl)}</span>
      </div>
    </div>
    <div style="text-align:left;color:${MUTED};font-size:12px;line-height:1.7;">
      <div><strong style="color:#111827;">תקופת הדוח</strong></div>
      <div>${dateHe(data.range.from)} – ${dateHe(data.range.to)}</div>
      <div>${escapeHtml(data.presetLabel)}</div>
      <div style="margin-top:6px;">הופק: ${dateHe(data.generatedAt)}</div>
    </div>
  </header>

  ${mockBanner}

  <section class="section">
    ${sectionTitle("תקציר מנהלים")}
    <p style="background:#f8fafc;border:1px solid ${BORDER};border-radius:10px;padding:14px 16px;margin:0;">
      ${executiveSummary(data)}
    </p>
  </section>

  <section class="section">
    ${sectionTitle("מדדים מרכזיים")}
    <div style="color:${MUTED};font-size:12px;margin-bottom:8px;">בהשוואה לתקופה הקודמת (${dateHe(
      data.previousRange.from
    )} – ${dateHe(data.previousRange.to)})</div>
    ${kpiCards(data.summary)}
  </section>

  <section class="section">
    ${sectionTitle("ביטויי החיפוש המובילים")}
    ${queriesTable(data.topQueries)}
  </section>

  <section class="section">
    ${sectionTitle("תנועה במיקומים")}
    <div>
      ${moversTable(data.risingQueries, "rising")}
      <div style="width:3%;display:inline-block;"></div>
      ${moversTable(data.decliningQueries, "declining")}
    </div>
  </section>

  <section class="section">
    ${sectionTitle("עמודי הנחיתה המובילים")}
    ${pagesTable(data.topPages)}
  </section>

  <section class="section">
    ${sectionTitle("סיכום פעילות החודש ותכנית קדימה")}
    <table style="width:100%;border-collapse:collapse;">
      <tr>
        <td style="width:50%;vertical-align:top;padding-left:10px;">
          <h3 style="font-size:14px;margin:0 0 8px;">מה בוצע החודש</h3>
          <ul style="margin:0;padding-inline-start:18px;color:#374151;">
            <li>אופטימיזציית תוכן לעמודים המובילים</li>
            <li>שיפור מהירות וחווית משתמש (Core Web Vitals)</li>
            <li>בניית קישורים ופרסום תוכן חדש</li>
          </ul>
        </td>
        <td style="width:50%;vertical-align:top;padding-right:10px;border-right:1px solid ${BORDER};">
          <h3 style="font-size:14px;margin:0 0 8px;">תכנית לחודש הבא</h3>
          <ul style="margin:0;padding-inline-start:18px;color:#374151;">
            <li>הרחבת תוכן לביטויים בעלי פוטנציאל</li>
            <li>חיזוק העמודים שירדו במיקום</li>
            <li>המשך בניית קישורים איכותיים</li>
          </ul>
        </td>
      </tr>
    </table>
    <p style="color:${MUTED};font-size:12px;margin-top:10px;">* ניתן לערוך טקסט זה לפני שליחת הדוח ללקוח.</p>
  </section>

  <footer style="margin-top:32px;border-top:1px solid ${BORDER};padding-top:12px;color:${MUTED};font-size:11px;text-align:center;">
    דוח זה הופק אוטומטית ממערכת ניהול הקמפיינים · נתוני חיפוש אורגני מ-Google Search Console
  </footer>
</body>
</html>`;
}
