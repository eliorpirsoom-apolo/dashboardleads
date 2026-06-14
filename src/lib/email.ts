import nodemailer from "nodemailer";
import type { RegressionResult } from "./types";

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
