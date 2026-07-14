// Minimal inline SVG icon set (stroke style) — no icon library dependency.

const PATHS: Record<string, React.ReactNode> = {
  home: (
    <path d="M3 10.5 12 3l9 7.5M5 9.5V21h5v-6h4v6h5V9.5" />
  ),
  users: (
    <>
      <circle cx="9" cy="8" r="3.5" />
      <path d="M2.5 20c.8-3.2 3.4-5 6.5-5s5.7 1.8 6.5 5M16.5 4.6a3.5 3.5 0 0 1 0 6.8M18.5 15.3c1.6.7 2.6 2 3 4.7" />
    </>
  ),
  leads: (
    <>
      <path d="M4 5h16M4 12h16M4 19h10" />
      <circle cx="19" cy="19" r="2.5" />
    </>
  ),
  calendar: (
    <>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M8 3v4M16 3v4M3 10h18" />
    </>
  ),
  tasks: (
    <path d="m5 12 4 4L19 6M5 19h14" />
  ),
  folder: (
    <path d="M3 7a2 2 0 0 1 2-2h4l2 3h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z" />
  ),
  doc: (
    <>
      <path d="M6 3h8l4 4v14H6V3Z" />
      <path d="M14 3v4h4M9 12h6M9 16h6" />
    </>
  ),
  chart: (
    <path d="M4 20V4M4 20h16M8 16v-5M12 16V8M16 16v-3M20 16V6" />
  ),
  building: (
    <>
      <path d="M4 21V5a1 1 0 0 1 1-1h9a1 1 0 0 1 1 1v16M15 9h4a1 1 0 0 1 1 1v11M2 21h20" />
      <path d="M7.5 8h2M7.5 12h2M7.5 16h2" />
    </>
  ),
  megaphone: (
    <path d="M3 11v2a1 1 0 0 0 1 1h2l3 5h2v-5.2L20 17V5l-9 3.2H4a1 1 0 0 0-1 1ZM11 14v5" />
  ),
  settings: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2v3M12 19v3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M2 12h3M19 12h3M4.9 19.1 7 17M17 7l2.1-2.1" />
    </>
  ),
  logout: (
    <path d="M15 4h4a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-4M10 17l-5-5 5-5M5 12h11" />
  ),
  plus: <path d="M12 5v14M5 12h14" />,
  search: (
    <>
      <circle cx="10.5" cy="10.5" r="6.5" />
      <path d="m15.5 15.5 5 5" />
    </>
  ),
  phone: (
    <path d="M5 4h4l2 5-2.5 1.5a12 12 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2Z" />
  ),
  mail: (
    <>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="m3 7 9 6 9-6" />
    </>
  ),
  whatsapp: (
    <>
      <path d="M12 3a9 9 0 0 0-7.8 13.5L3 21l4.7-1.2A9 9 0 1 0 12 3Z" />
      <path d="M9 8.5c-.5 2.5 3 6 5.5 6.5l1-1.5-2-1.5-1 .5c-1-.5-1.5-1-2-2l.5-1L9.5 7l-.5 1.5Z" />
    </>
  ),
  x: <path d="M6 6l12 12M18 6 6 18" />,
  chevronDown: <path d="m6 9 6 6 6-6" />,
  upload: <path d="M12 16V4m0 0 5 5m-5-5L7 9M4 20h16" />,
  download: <path d="M12 4v12m0 0 5-5m-5 5-5-5M4 20h16" />,
  clock: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 3" />
    </>
  ),
  link: (
    <path d="M10 14a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1.5 1.5M14 10a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1.5-1.5" />
  ),
  menu: <path d="M4 6h16M4 12h16M4 18h16" />,
  alert: (
    <path d="M12 3 2.5 20h19L12 3Zm0 7v4m0 3v.5" />
  ),
  money: (
    <>
      <rect x="3" y="6" width="18" height="12" rx="2" />
      <circle cx="12" cy="12" r="2.5" />
    </>
  ),
  note: (
    <path d="M5 4h14v13l-4 4H5V4Zm10 17v-4h4M8 9h8M8 13h5" />
  ),
  filter: <path d="M4 5h16l-6 7v6l-4-2v-4L4 5Z" />,
  eye: (
    <>
      <path d="M2 12s3.5-6.5 10-6.5S22 12 22 12s-3.5 6.5-10 6.5S2 12 2 12Z" />
      <circle cx="12" cy="12" r="2.8" />
    </>
  ),
  trash: (
    <path d="M4 7h16M9 7V4h6v3M6 7l1 14h10l1-14M10 11v6M14 11v6" />
  ),
  edit: (
    <path d="M4 20h4L20 8l-4-4L4 16v4ZM13 7l4 4" />
  ),
  check: <path d="m5 13 5 5L20 7" />,
  google: (
    <path d="M21 12.2c0-.7-.1-1.4-.2-2H12v3.9h5.1a4.4 4.4 0 0 1-1.9 2.9v2.4h3A9 9 0 0 0 21 12.2ZM12 21a8.6 8.6 0 0 0 6-2.2l-3-2.4a5.4 5.4 0 0 1-8-2.8H3.9v2.5A9 9 0 0 0 12 21ZM7 13.6a5.4 5.4 0 0 1 0-3.4V7.7H3.9a9 9 0 0 0 0 8.4L7 13.6ZM12 6.6c1.3 0 2.5.5 3.4 1.3l2.6-2.6A9 9 0 0 0 3.9 7.7L7 10.2c.7-2.1 2.7-3.6 5-3.6Z" />
  ),
};

export function Icon({
  name,
  className = "h-5 w-5",
}: {
  name: keyof typeof PATHS | string;
  className?: string;
}) {
  const content = PATHS[name] ?? PATHS.doc;
  const filled = name === "google";
  return (
    <svg
      viewBox="0 0 24 24"
      fill={filled ? "currentColor" : "none"}
      stroke={filled ? "none" : "currentColor"}
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      {content}
    </svg>
  );
}
