// פוטר מערכת — קישורי הרשתות של אפולו, נפתחים בחלון חדש.
// לעדכון/הוספת קישור: ערוך את SOCIALS. ערכים ריקים (null) לא מוצגים.

const SOCIALS: { key: string; label: string; url: string | null; icon: JSX.Element }[] = [
  {
    key: "website",
    label: "האתר שלנו",
    url: "https://apolloadv.co.il/",
    icon: (
      <path d="M12 2a10 10 0 100 20 10 10 0 000-20zm0 0c2.5 2.5 3.5 6 3.5 10s-1 7.5-3.5 10m0-20C9.5 4.5 8.5 8 8.5 12s1 7.5 3.5 10M2.5 9h19M2.5 15h19" />
    ),
  },
  {
    key: "facebook",
    label: "פייסבוק",
    url: "https://www.facebook.com/Apollo8ADS",
    icon: (
      <path d="M14 8.5V7c0-.8.2-1.5 1.5-1.5H17V2.5h-2.5C11.7 2.5 10.5 4.3 10.5 7v1.5H8.5V12h2v9.5H14V12h2.3l.4-3.5H14z" />
    ),
  },
  {
    key: "instagram",
    label: "אינסטגרם",
    url: null, // TODO: כתובת אינסטגרם
    icon: (
      <>
        <rect x="3" y="3" width="18" height="18" rx="5" ry="5" />
        <circle cx="12" cy="12" r="4" />
        <circle cx="17.5" cy="6.5" r="1.2" />
      </>
    ),
  },
  {
    key: "tiktok",
    label: "טיקטוק",
    url: null, // TODO: כתובת טיקטוק
    icon: (
      <path d="M15 3c.3 2.3 1.8 4 4 4.3V10c-1.5 0-2.9-.4-4-1.2v6.3A5.3 5.3 0 118.7 10v2.8A2.6 2.6 0 1012 15V3h3z" />
    ),
  },
];

export default function Footer() {
  const links = SOCIALS.filter((s) => s.url);
  return (
    <footer className="mt-10 border-t border-slate-800/70 pt-5 pb-2">
      <div className="flex flex-col items-center gap-3 text-slate-500 sm:flex-row sm:justify-between">
        <p className="text-[11px]">
          © {new Date().getFullYear()} Apollo CRM · אפולו פרסום
        </p>
        <div className="flex items-center gap-3">
          {links.map((s) => (
            <a
              key={s.key}
              href={s.url!}
              target="_blank"
              rel="noopener noreferrer"
              title={s.label}
              aria-label={s.label}
              className="flex h-9 w-9 items-center justify-center rounded-full border border-slate-800 text-slate-400 transition hover:border-cyan-500/50 hover:text-cyan-300"
            >
              <svg
                viewBox="0 0 24 24"
                className="h-4 w-4"
                fill={s.key === "website" ? "none" : "currentColor"}
                stroke={s.key === "website" ? "currentColor" : "none"}
                strokeWidth={s.key === "website" ? 1.6 : 0}
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                {s.icon}
              </svg>
            </a>
          ))}
        </div>
      </div>
    </footer>
  );
}
