import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { clientTypeLabel, hasModule } from "@/lib/modules";
import { Chip } from "@/components/ui";
import ClientTabs from "./ClientTabs";

export const dynamic = "force-dynamic";

// Admin workspace for a single client: header + tab navigation.
// Admin sees the SAME feature components the client sees, plus management.
export default async function ClientWorkspaceLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: { id: string };
}) {
  const client = await prisma.client.findUnique({ where: { id: params.id } });
  if (!client) notFound();

  const tabs = [
    { href: `/admin/clients/${client.id}`, label: "סקירה", exact: true },
    { href: `/admin/clients/${client.id}/leads`, label: "לידים" },
    ...(hasModule(client.type, "realestate")
      ? [{ href: `/admin/clients/${client.id}/projects`, label: "פרויקטים" }]
      : []),
    ...(hasModule(client.type, "seo")
      ? [{ href: `/admin/clients/${client.id}/seo`, label: "SEO" }]
      : []),
    { href: `/admin/clients/${client.id}/tasks`, label: "משימות" },
    { href: `/admin/clients/${client.id}/calendar`, label: "לוח שנה" },
    { href: `/admin/clients/${client.id}/documents`, label: "מסמכים" },
    { href: `/admin/clients/${client.id}/reports`, label: "דוחות" },
    { href: `/admin/clients/${client.id}/settings`, label: "הגדרות" },
  ];

  return (
    <>
      <div className="mb-5 flex flex-wrap items-center gap-3">
        {client.logoKey ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={`/api/files/${client.logoKey}`}
            alt=""
            className="h-11 w-11 rounded-xl border border-slate-700 bg-white/5 object-contain p-0.5"
          />
        ) : (
          <div
            className="flex h-11 w-11 items-center justify-center rounded-xl text-sm font-black text-white"
            style={{ backgroundColor: client.color ?? "#334155" }}
          >
            {client.name.slice(0, 2)}
          </div>
        )}
        <div>
          <h1 className="text-xl font-bold text-slate-100">{client.name}</h1>
          <p className="text-xs text-slate-500">
            {client.contactName ?? ""} {client.contactPhone ? `· ${client.contactPhone}` : ""}
          </p>
        </div>
        <Chip color="#818cf8">{clientTypeLabel(client.type)}</Chip>
        {!client.active ? <Chip color="#f87171">לא פעיל</Chip> : null}
      </div>

      <ClientTabs tabs={tabs} />
      <div className="mt-4">{children}</div>
    </>
  );
}
