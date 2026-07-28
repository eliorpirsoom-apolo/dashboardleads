import { prisma } from "./prisma";
import { sendMessage, renderTemplate, type Channel } from "./messaging";
import { parseMsgConfig, effectiveFlags, effectiveChannels } from "./messagingConfig";

// התראת "ליד חדש" למשתמשי הלקוח — לפי הרשאות הדיוור (leadAlerts + ערוצים אפקטיביים).
async function sendNewLeadAlert(leadId: string): Promise<void> {
  const lead = await prisma.lead.findUnique({
    where: { id: leadId },
    include: {
      client: { select: { name: true, messagingConfig: true } },
      source: { select: { name: true } },
    },
  });
  if (!lead) return;
  const cfg = parseMsgConfig(lead.client?.messagingConfig);
  if (!effectiveFlags(cfg).leadAlerts) return;
  const channels = effectiveChannels(cfg);
  if (channels.length === 0) return;

  const users = await prisma.user.findMany({
    where: { clientId: lead.clientId, active: true },
    select: { email: true, phone: true },
  });
  const body =
    `📩 ליד חדש${lead.source?.name ? ` מ-${lead.source.name}` : ""}:\n` +
    `${lead.fullName ?? "ללא שם"}${lead.phone ? ` · ${lead.phone}` : ""}` +
    `${lead.email ? ` · ${lead.email}` : ""}`;
  for (const ch of channels) {
    for (const u of users) {
      const to = ch === "email" ? u.email : u.phone ?? "";
      if (!to) continue;
      await sendMessage({
        channel: ch as Channel,
        to,
        subject: "ליד חדש 📩",
        body,
        kind: "automation",
        clientId: lead.clientId,
        leadId: lead.id,
      }).catch(() => {});
    }
  }
}

// ---------------------------------------------------------------------------
// Domain hooks — fired on lead lifecycle events.
//
// 1. Inventory automation (real-estate): a lead linked to a unit type
//    entering a "won" status decrements available stock; leaving "won"
//    restores it. Every change is audited in InventoryEvent.
// 2. Automations: client-defined rules (lead_created / status_changed)
//    send templated messages through the messaging layer.
// ---------------------------------------------------------------------------

async function systemKindOf(statusId: string | null): Promise<string | null> {
  if (!statusId) return null;
  const s = await prisma.leadStatus.findUnique({ where: { id: statusId } });
  return s?.systemKind ?? null;
}

/**
 * Handle a lead's status transition. Call AFTER the lead row is updated.
 * `actorName` lands in the inventory audit trail.
 */
export async function onLeadStatusChanged(
  leadId: string,
  prevStatusId: string | null,
  nextStatusId: string | null,
  actorName: string
): Promise<void> {
  if (prevStatusId === nextStatusId) return;

  const lead = await prisma.lead.findUnique({ where: { id: leadId } });
  if (!lead) return;

  const [prevKind, nextKind] = await Promise.all([
    systemKindOf(prevStatusId),
    systemKindOf(nextStatusId),
  ]);

  // --- Inventory automation (only when the lead is tied to a unit type) ----
  if (lead.unitTypeId && prevKind !== "won" && nextKind === "won") {
    await prisma.$transaction(async (tx) => {
      const unit = await tx.unitType.findUnique({
        where: { id: lead.unitTypeId! },
      });
      if (!unit) return;
      if (unit.soldUnits >= unit.totalUnits) {
        // Guard: never oversell; audit the attempt instead.
        await tx.inventoryEvent.create({
          data: {
            unitTypeId: unit.id,
            delta: 0,
            reason: "sold",
            leadId,
            actorName,
            note: "חריגה נמנעה: אין מלאי זמין בטיפוס זה",
          },
        });
        return;
      }
      await tx.unitType.update({
        where: { id: unit.id },
        data: { soldUnits: { increment: 1 } },
      });
      await tx.inventoryEvent.create({
        data: {
          unitTypeId: unit.id,
          delta: -1,
          reason: "sold",
          leadId,
          actorName,
        },
      });
    });
  } else if (lead.unitTypeId && prevKind === "won" && nextKind !== "won") {
    await prisma.$transaction(async (tx) => {
      const unit = await tx.unitType.findUnique({
        where: { id: lead.unitTypeId! },
      });
      if (!unit || unit.soldUnits <= 0) return;
      await tx.unitType.update({
        where: { id: unit.id },
        data: { soldUnits: { decrement: 1 } },
      });
      await tx.inventoryEvent.create({
        data: {
          unitTypeId: unit.id,
          delta: 1,
          reason: "reverted",
          leadId,
          actorName,
          note: "ביטול עסקה — הדירה חזרה למלאי",
        },
      });
    });
  }

  // --- Client automations on status change ---------------------------------
  if (nextStatusId) {
    await fireAutomations(lead.clientId, "status_changed", leadId, nextStatusId);
  }
}

/** Fired when a new lead is created (intake or manual). */
export async function onLeadCreated(leadId: string): Promise<void> {
  const lead = await prisma.lead.findUnique({ where: { id: leadId } });
  if (!lead) return;
  await fireAutomations(lead.clientId, "lead_created", leadId, null);
  await sendNewLeadAlert(leadId).catch((e) => console.error("[lead-alert]", e));
}

async function fireAutomations(
  clientId: string,
  trigger: "lead_created" | "status_changed",
  leadId: string,
  statusId: string | null
): Promise<void> {
  const automations = await prisma.automation.findMany({
    where: {
      clientId,
      trigger,
      active: true,
      ...(trigger === "status_changed" ? { statusId } : {}),
    },
  });
  if (automations.length === 0) return;

  const lead = await prisma.lead.findUnique({
    where: { id: leadId },
    include: { status: true, campaign: true, client: true, assignee: true },
  });
  if (!lead) return;

  const vars = {
    name: lead.fullName ?? "",
    phone: lead.phone ?? "",
    email: lead.email ?? "",
    number: lead.number,
    status: lead.status?.name ?? "",
    campaign: lead.campaign?.name ?? lead.campaignLabel ?? "",
    client: lead.client.name,
    channel: lead.channel ?? "",
    assignee: lead.assignee?.name ?? "",
  };

  for (const auto of automations) {
    // "assignee" — ההודעה הולכת למטפל בליד עצמו.
    const recipients =
      auto.recipientType === "assignee"
        ? lead.assignee
          ? [
              auto.channel === "email"
                ? lead.assignee.email
                : lead.assignee.phone ?? "",
            ].filter(Boolean)
          : []
        : await resolveRecipients(
            clientId,
            auto.recipientType,
            auto.customRecipients,
            auto.channel as Channel
          );
    const body = renderTemplate(auto.template, vars);
    for (const to of recipients) {
      await sendMessage({
        channel: auto.channel as Channel,
        to,
        subject: `עדכון ליד — ${lead.client.name}`,
        body,
        kind: "automation",
        clientId,
        leadId,
      });
    }
  }
}

async function resolveRecipients(
  clientId: string,
  recipientType: string,
  customRecipients: string | null,
  channel: Channel
): Promise<string[]> {
  if (recipientType === "custom" && customRecipients) {
    try {
      const arr = JSON.parse(customRecipients);
      return Array.isArray(arr) ? arr.map(String).filter(Boolean) : [];
    } catch {
      return [];
    }
  }
  const users = await prisma.user.findMany({
    where: {
      clientId,
      active: true,
      ...(recipientType === "agents" ? { isAgent: true } : {}),
    },
  });
  return users
    .map((u) => (channel === "email" ? u.email : u.phone ?? ""))
    .filter(Boolean);
}
