import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Lead & Campaign Dashboard",
  description:
    "Campaign & Lead Management Dashboard for Lead Manager (ליד מנג'ר) — KPIs, trends, regression alerts.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
