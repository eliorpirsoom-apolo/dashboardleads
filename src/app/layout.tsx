import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "מערכת CRM — ניהול לקוחות ולידים",
  description:
    "CRM דו-צדדי למשרד דיגיטל: ניהול לקוחות, לידים, קמפיינים, משימות ומסמכים.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Hebrew UI, right-to-left, permanent dark "tech" theme.
  return (
    <html lang="he" dir="rtl" className="dark">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        {/* Heebo: full Hebrew + Latin coverage. Falls back to system fonts. */}
        <link
          href="https://fonts.googleapis.com/css2?family=Heebo:wght@300;400;500;600;700;800&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="min-h-screen font-sans antialiased">{children}</body>
    </html>
  );
}
