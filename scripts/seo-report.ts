/**
 * Generate (and optionally email) the organic-search PDF report.
 *
 *   npm run report:seo                 # write PDF to ./reports, previous month
 *   npm run report:seo -- --send       # also email it (needs EMAIL_ENABLED)
 *   npm run report:seo -- --preset currentMonth
 *   npm run report:seo -- --client "שם הלקוח" --to client@example.com
 *
 * Cron example (1st of every month at 08:00):
 *   0 8 1 * * cd /path/to/dashboardleads && npm run report:seo -- --send
 */
import "dotenv/config";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { buildSeoReportData } from "../src/lib/seoReport";
import { renderReportPdf, reportFileName } from "../src/lib/reportPdf";
import { sendSeoReport } from "../src/lib/email";
import type { DatePreset } from "../src/lib/types";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
function flag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

async function main() {
  const preset = (arg("preset") as DatePreset) ?? "previousMonth";
  const clientName = arg("client");
  const recipient = arg("to") ?? process.env.SEO_REPORT_EMAIL_TO;

  console.log(`[report] Building SEO report (preset=${preset})...`);
  const data = await buildSeoReportData({ preset, clientName });
  console.log(
    `[report] Data ready${data.isMock ? " (mock — no Search Console credentials)" : ""}.`
  );

  const pdf = await renderReportPdf(data);
  const fileName = reportFileName(data);

  const outDir = join(process.cwd(), "reports");
  await mkdir(outDir, { recursive: true });
  const outPath = join(outDir, fileName);
  await writeFile(outPath, pdf);
  console.log(`[report] PDF written to ${outPath} (${(pdf.length / 1024).toFixed(0)} KB)`);

  if (flag("send")) {
    if (!recipient) {
      console.error("[report] --send requested but no recipient (use --to or SEO_REPORT_EMAIL_TO).");
      process.exit(1);
    }
    const sent = await sendSeoReport({ to: recipient, pdf, fileName, data });
    console.log(
      sent
        ? `[report] Emailed to ${recipient}.`
        : "[report] Not sent (EMAIL_ENABLED=false or send failed)."
    );
  }
}

main().catch((err) => {
  console.error("[report] Fatal error:", err);
  process.exit(1);
});
