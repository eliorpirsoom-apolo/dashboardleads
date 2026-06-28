import { NextResponse } from "next/server";
import { buildSeoReportData } from "@/lib/seoReport";
import { renderReportPdf, reportFileName } from "@/lib/reportPdf";
import { sendSeoReport } from "@/lib/email";
import type { DatePreset, DateRange } from "@/lib/types";

export const dynamic = "force-dynamic";
// Playwright needs the Node.js runtime (not the Edge runtime).
export const runtime = "nodejs";

const VALID_PRESETS: DatePreset[] = [
  "yesterday",
  "last7",
  "currentMonth",
  "previousMonth",
  "lastYear",
  "custom",
];

function parseReportParams(searchParams: URLSearchParams) {
  const presetParam = (searchParams.get("preset") ??
    "previousMonth") as DatePreset;
  const preset = VALID_PRESETS.includes(presetParam)
    ? presetParam
    : "previousMonth";
  const clientName = searchParams.get("client") ?? undefined;

  let range: DateRange | undefined;
  if (preset === "custom") {
    const from = searchParams.get("from");
    const to = searchParams.get("to");
    if (from && to) {
      const toDate = new Date(to);
      toDate.setHours(23, 59, 59, 999);
      range = { from: new Date(from).toISOString(), to: toDate.toISOString() };
    }
  }
  return { preset, range, clientName };
}

// GET /api/reports/seo?preset=previousMonth[&from=&to=][&client=Name]
// Streams the generated PDF report for download.
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const { preset, range, clientName } = parseReportParams(searchParams);
    const data = await buildSeoReportData({ preset, range, clientName });
    const pdf = await renderReportPdf(data);

    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${reportFileName(data)}"`,
      },
    });
  } catch (err) {
    console.error("[api/reports/seo] GET", err);
    return NextResponse.json(
      { error: "Failed to generate SEO report" },
      { status: 500 }
    );
  }
}

// POST /api/reports/seo  { preset?, from?, to?, client?, to? }
// Generates the report and emails it (requires EMAIL_ENABLED + SMTP config).
export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as {
      preset?: DatePreset;
      from?: string;
      to?: string;
      client?: string;
      to_email?: string;
    };

    const params = new URLSearchParams();
    if (body.preset) params.set("preset", body.preset);
    if (body.from) params.set("from", body.from);
    if (body.to) params.set("to", body.to);
    if (body.client) params.set("client", body.client);
    const { preset, range, clientName } = parseReportParams(params);

    const recipient = body.to_email ?? process.env.SEO_REPORT_EMAIL_TO;
    if (!recipient) {
      return NextResponse.json(
        { error: "No recipient: pass `to_email` or set SEO_REPORT_EMAIL_TO" },
        { status: 400 }
      );
    }

    const data = await buildSeoReportData({ preset, range, clientName });
    const pdf = await renderReportPdf(data);
    const fileName = reportFileName(data);
    const sent = await sendSeoReport({ to: recipient, pdf, fileName, data });

    return NextResponse.json({
      sent,
      recipient,
      fileName,
      isMock: data.isMock,
      message: sent
        ? "Report emailed."
        : "Report generated but not sent (EMAIL_ENABLED=false or send failed).",
    });
  } catch (err) {
    console.error("[api/reports/seo] POST", err);
    return NextResponse.json(
      { error: "Failed to send SEO report" },
      { status: 500 }
    );
  }
}
