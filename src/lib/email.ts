import nodemailer from "nodemailer";
import type { RegressionResult, SeoReportData } from "./types";

// ---------------------------------------------------------------------------
// Email alerting (Nodemailer)
//
// Sends an admin alert when the sync detects a significant week-over-week drop
// in lead volume. Sending is gated behind EMAIL_ENABLED so the rest of the app
// works without SMTP credentials configured.
// ---------------------------------------------------------------------------

function emailEnabled(): boolean {
  return process.env.EMAIL_ENABLED === "true";
}

function buildTransport() {
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT ?? 587),
    secure: process.env.SMTP_SECURE === "true",
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASSWORD,
    },
  });
}

function renderHtml(regressions: RegressionResult[], threshold: number): string {
  const rows = regressions
    .map(
      (r) => `
      <tr>
        <td style="padding:8px 12px;border-bottom:1px solid #eee;">${r.campaign}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:right;">${r.previousWeek}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:right;">${r.currentWeek}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:right;color:#dc2626;font-weight:600;">-${r.dropPercent}%</td>
      </tr>`
    )
    .join("");

  return `
  <div style="font-family:Arial,Helvetica,sans-serif;max-width:640px;margin:0 auto;">
    <h2 style="color:#dc2626;">⚠️ Lead Volume Drop Detected</h2>
    <p>The following campaign(s) dropped by at least <strong>${threshold}%</strong>
       in lead volume compared to the previous week:</p>
    <table style="border-collapse:collapse;width:100%;font-size:14px;">
      <thead>
        <tr style="background:#f9fafb;text-align:left;">
          <th style="padding:8px 12px;border-bottom:2px solid #e5e7eb;">Campaign</th>
          <th style="padding:8px 12px;border-bottom:2px solid #e5e7eb;text-align:right;">Prev Week</th>
          <th style="padding:8px 12px;border-bottom:2px solid #e5e7eb;text-align:right;">This Week</th>
          <th style="padding:8px 12px;border-bottom:2px solid #e5e7eb;text-align:right;">Change</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
    <p style="color:#6b7280;font-size:12px;margin-top:24px;">
      This is an automated alert from the Lead Management Dashboard.
    </p>
  </div>`;
}

/**
 * Send a regression alert email. Returns true if an email was sent.
 * Never throws — failures are logged and swallowed so they don't break sync.
 */
export async function sendRegressionAlert(
  regressions: RegressionResult[],
  threshold: number
): Promise<boolean> {
  const flagged = regressions.filter((r) => r.isRegression);
  if (flagged.length === 0) return false;

  if (!emailEnabled()) {
    console.log(
      `[email] EMAIL_ENABLED is false — skipping send. ${flagged.length} campaign(s) flagged.`
    );
    return false;
  }

  try {
    const transport = buildTransport();
    await transport.sendMail({
      from: process.env.ALERT_EMAIL_FROM,
      to: process.env.ALERT_EMAIL_TO,
      subject: `⚠️ Lead drop alert: ${flagged.length} campaign(s) down ≥${threshold}%`,
      html: renderHtml(flagged, threshold),
    });
    console.log(`[email] Alert sent to ${process.env.ALERT_EMAIL_TO}`);
    return true;
  } catch (err) {
    console.error("[email] Failed to send alert:", err);
    return false;
  }
}

// ---------------------------------------------------------------------------
// SEO report delivery
//
// Emails the generated organic-search PDF report to the client. Like the alert
// path, sending is gated behind EMAIL_ENABLED and never throws.
// ---------------------------------------------------------------------------

export interface SendSeoReportOptions {
  to: string;
  pdf: Buffer;
  fileName: string;
  data: SeoReportData;
  // Optional override of the From header; defaults to ALERT_EMAIL_FROM.
  from?: string;
}

function reportEmailBody(data: SeoReportData): string {
  const period = `${new Date(data.range.from).toLocaleDateString(
    "he-IL"
  )} – ${new Date(data.range.to).toLocaleDateString("he-IL")}`;
  const clicks = data.summary.find((m) => m.key === "clicks");
  const headline = clicks
    ? `<p style="margin:0 0 12px;">סך הקליקים האורגניים בתקופה: <strong>${new Intl.NumberFormat(
        "he-IL"
      ).format(Math.round(clicks.value))}</strong>.</p>`
    : "";

  return `
  <div dir="rtl" style="font-family:Arial,Helvetica,sans-serif;max-width:600px;margin:0 auto;color:#111827;">
    <h2 style="color:#2563eb;">דוח קידום אורגני — ${data.clientName}</h2>
    <p style="margin:0 0 12px;">שלום,</p>
    <p style="margin:0 0 12px;">מצורף דוח הקידום האורגני בגוגל לתקופה <strong>${period}</strong>.</p>
    ${headline}
    <p style="margin:0 0 12px;">הדוח המלא, כולל ביטויי החיפוש המובילים ועמודי הנחיתה, מצורף כקובץ PDF.</p>
    <p style="color:#6b7280;font-size:12px;margin-top:24px;">
      הופק אוטומטית ממערכת ניהול הקמפיינים.
    </p>
  </div>`;
}

/**
 * Send the SEO report PDF as an email attachment. Returns true if sent.
 */
export async function sendSeoReport(
  opts: SendSeoReportOptions
): Promise<boolean> {
  if (!emailEnabled()) {
    console.log(
      `[email] EMAIL_ENABLED is false — skipping SEO report send to ${opts.to}.`
    );
    return false;
  }

  try {
    const transport = buildTransport();
    const period = new Date(opts.data.range.to).toLocaleDateString("he-IL", {
      month: "long",
      year: "numeric",
    });
    await transport.sendMail({
      from: opts.from ?? process.env.ALERT_EMAIL_FROM,
      to: opts.to,
      subject: `דוח קידום אורגני — ${opts.data.clientName} — ${period}`,
      html: reportEmailBody(opts.data),
      attachments: [
        {
          filename: opts.fileName,
          content: opts.pdf,
          contentType: "application/pdf",
        },
      ],
    });
    console.log(`[email] SEO report sent to ${opts.to}`);
    return true;
  } catch (err) {
    console.error("[email] Failed to send SEO report:", err);
    return false;
  }
}
