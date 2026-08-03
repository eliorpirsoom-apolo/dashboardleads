import type { Metadata } from "next";
import ToasterProvider from "@/components/Toaster";
import "./globals.css";

export const metadata: Metadata = {
  title: "Apollo CRM — ניהול לקוחות ולידים",
  description:
    "CRM דו-צדדי למשרד דיגיטל: ניהול לקוחות, לידים, קמפיינים, משימות ומסמכים.",
  icons: { icon: "/brand/apollo-icon.jpg" },
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
        {/* Ploni (self-hosted, licensed) — primary UI font. Preload the common weights. */}
        <link rel="preload" href="/fonts/ploni-regular.woff2" as="font" type="font/woff2" crossOrigin="anonymous" />
        <link rel="preload" href="/fonts/ploni-bold.woff2" as="font" type="font/woff2" crossOrigin="anonymous" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        {/* Rubik: fallback for any glyphs Ploni doesn't cover. */}
        <link
          href="https://fonts.googleapis.com/css2?family=Rubik:wght@300;400;500;600;700;800&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="min-h-screen font-sans antialiased">
        <ToasterProvider>{children}</ToasterProvider>
      </body>
    </html>
  );
}
