import { chromium } from "playwright";
import { renderReportHtml } from "./reportTemplate";
import type { SeoReportData } from "./types";

// ---------------------------------------------------------------------------
// HTML → PDF rendering via Playwright (already a project dependency for the
// scraper). Chromium renders the RTL report with full CSS/print-background
// support and emits an A4 PDF buffer ready to attach to an email.
// ---------------------------------------------------------------------------

export async function renderReportPdf(data: SeoReportData): Promise<Buffer> {
  const html = renderReportHtml(data);
  const browser = await chromium.launch({
    headless: true,
    args: ["--no-sandbox"],
    // Optional override for containerized/serverless environments where the
    // Chromium binary lives at a non-default path. Leave unset to use the
    // browser installed via `npx playwright install chromium`.
    executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || undefined,
  });
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "networkidle" });
    const pdf = await page.pdf({
      format: "A4",
      printBackground: true,
      margin: { top: "16mm", bottom: "16mm", left: "14mm", right: "14mm" },
      displayHeaderFooter: true,
      headerTemplate: "<span></span>",
      footerTemplate: `
        <div style="width:100%;font-size:8px;color:#9ca3af;padding:0 14mm;text-align:center;">
          עמוד <span class="pageNumber"></span> מתוך <span class="totalPages"></span>
        </div>`,
    });
    return pdf;
  } finally {
    await browser.close();
  }
}

/** Suggested filename for the report, e.g. seo-report-2026-06.pdf */
export function reportFileName(data: SeoReportData): string {
  const d = new Date(data.range.to);
  const stamp = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  const slug = data.clientName
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^\w֐-׿-]/g, "");
  return `seo-report-${slug || "client"}-${stamp}.pdf`;
}
