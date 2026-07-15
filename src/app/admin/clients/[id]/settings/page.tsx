import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import UsersManager from "@/components/settings/UsersManager";
import SourcesManager from "@/components/settings/SourcesManager";
import StatusEditor from "@/components/settings/StatusEditor";
import CustomFieldsEditor from "@/components/settings/CustomFieldsEditor";
import AutomationsManager from "@/components/settings/AutomationsManager";
import IntegrationsCard from "@/components/settings/IntegrationsCard";
import IntakeLogCard from "@/components/settings/IntakeLogCard";
import ClientEditCard from "./ClientEditCard";

export const dynamic = "force-dynamic";

// Admin settings for a client: profile, users, intake sources, statuses, fields.
export default async function ClientSettingsPage({
  params,
}: {
  params: { id: string };
}) {
  const client = await prisma.client.findUnique({
    where: { id: params.id },
    include: {
      users: {
        select: {
          id: true, email: true, name: true, isAgent: true,
          active: true, phone: true, lastLoginAt: true, googleId: true,
        },
        orderBy: { createdAt: "asc" },
      },
    },
  });
  if (!client) notFound();

  return (
    <div className="flex flex-col gap-4">
      <ClientEditCard
        client={{
          id: client.id,
          name: client.name,
          type: client.type,
          company: client.company,
          contactName: client.contactName,
          contactEmail: client.contactEmail,
          contactPhone: client.contactPhone,
          color: client.color,
          notes: client.notes,
          active: client.active,
          autoAssignLeads: client.autoAssignLeads,
        }}
      />
      <UsersManager clientId={client.id} users={client.users} />
      <SourcesManager clientId={client.id} />
      <IntakeLogCard clientId={client.id} />
      <StatusEditor clientId={client.id} />
      <CustomFieldsEditor clientId={client.id} />
      <AutomationsManager clientId={client.id} />
      <IntegrationsCard clientId={client.id} clientType={client.type} />
    </div>
  );
}
