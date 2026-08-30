import { Prisma } from "@prisma/client";
import { prisma } from "./prisma";

// ---------------------------------------------------------------------------
// Lead core logic shared by intake, manual creation and imports:
// per-client sequential numbering, phone normalization, duplicate detection.
// ---------------------------------------------------------------------------

/** "+972-50 123-4567" / "972501234567" / "050 1234567" → "0501234567" */
export function normalizePhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let p = String(raw).replace(/[^\d+]/g, "");
  if (p.startsWith("+972")) p = "0" + p.slice(4);
  else if (p.startsWith("972")) p = "0" + p.slice(3);
  return p || null;
}

export function normalizeEmail(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const e = String(raw).trim().toLowerCase();
  return e.includes("@") ? e : null;
}

/**
 * Find an existing non-archived lead of the client with the same phone or
 * email that arrived within the dedupe window (default 24h) — the intake
 * endpoint uses this to block duplicates.
 */
export async function findDuplicateLead(
  clientId: string,
  phone: string | null,
  email: string | null,
  windowHours = 24
) {
  if (!phone && !email) return null;
  const since = new Date(Date.now() - windowHours * 60 * 60 * 1000);
  const or: Prisma.LeadWhereInput[] = [];
  if (phone) or.push({ phone });
  if (email) or.push({ email });
  return prisma.lead.findFirst({
    where: {
      clientId,
      archived: false,
      receivedAt: { gte: since },
      OR: or,
    },
    orderBy: { receivedAt: "desc" },
  });
}

/**
 * Create a lead with the next sequential number for the client.
 * Runs in a transaction; retries on the [clientId, number] unique collision
 * so concurrent intakes can't clash.
 */
export async function createLeadNumbered(
  data: Omit<Prisma.LeadUncheckedCreateInput, "number">
) {
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const created = await prisma.$transaction(async (tx) => {
        const last = await tx.lead.findFirst({
          where: { clientId: data.clientId },
          orderBy: { number: "desc" },
          select: { number: true },
        });
        return tx.lead.create({
          data: { ...data, number: (last?.number ?? 0) + 1 },
        });
      });
      // זיהוי כפול אוטומטי — כל נתיבי היצירה (קליטה/ידני/ייבוא) עוברים כאן.
      await markLeadIfDuplicate(created.id).catch(() => {});
      return created;
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === "P2002" &&
        attempt < 4
      ) {
        continue; // number collided with a concurrent create — retry
      }
      throw err;
    }
  }
  throw new Error("createLeadNumbered: exhausted retries");
}

/** סטטוס "כפול" של הלקוח — נוצר אוטומטית בזיהוי הראשון (systemKind: duplicate). */
export async function ensureDuplicateStatus(clientId: string): Promise<string> {
  const existing = await prisma.leadStatus.findFirst({
    where: { clientId, OR: [{ systemKind: "duplicate" }, { name: "כפול" }] },
  });
  if (existing) return existing.id;
  const last = await prisma.leadStatus.findFirst({
    where: { clientId },
    orderBy: { order: "desc" },
    select: { order: true },
  });
  const st = await prisma.leadStatus.create({
    data: {
      clientId,
      name: "כפול",
      color: "#94a3b8",
      order: (last?.order ?? 0) + 1,
      systemKind: "duplicate",
      isDefault: false,
    },
  });
  return st.id;
}

/**
 * זיהוי ליד כפול אוטומטי: ליד חדש (לא שיחה — לשיחות יש את מנגנון "פנייה
 * חוזרת") שהטלפון/אימייל שלו זהה לליד מוקדם יותר של אותו לקוח → מקבל סטטוס
 * "כפול" + רישום בציר הפעילות. הליד המקורי לא נגע. מחזיר true אם סומן.
 */
export async function markLeadIfDuplicate(leadId: string): Promise<boolean> {
  const lead = await prisma.lead.findUnique({ where: { id: leadId } });
  if (!lead || lead.kind === "call") return false;
  if (!lead.phone && !lead.email) return false;
  const or: Prisma.LeadWhereInput[] = [];
  if (lead.phone) or.push({ phone: lead.phone });
  if (lead.email) or.push({ email: lead.email });
  // רק לידים מוקדמים יותר נחשבים "מקור" — החדש הוא שמסומן ככפול.
  const original = await prisma.lead.findFirst({
    where: {
      clientId: lead.clientId,
      id: { not: lead.id },
      receivedAt: { lt: lead.receivedAt },
      OR: or,
    },
    orderBy: { receivedAt: "asc" },
    select: { id: true, number: true, phone: true },
  });
  if (!original) return false;
  const dupStatusId = await ensureDuplicateStatus(lead.clientId);
  if (lead.statusId === dupStatusId) return true;
  await prisma.lead.update({ where: { id: lead.id }, data: { statusId: dupStatusId } });
  const how = lead.phone && original.phone === lead.phone ? "טלפון" : "אימייל";
  const { recordActivity } = await import("./leadActivity");
  await recordActivity(lead.id, "מערכת", "status", {
    toValue: "כפול",
    note: `זוהה אוטומטית כליד כפול — אותו ${how} כמו ליד #${original.number}`,
  }).catch(() => {});
  return true;
}

/** The default status (or first by order) for new leads of a client. */
export async function defaultStatusId(
  clientId: string
): Promise<string | null> {
  const status = await prisma.leadStatus.findFirst({
    where: { clientId, isDefault: true },
  });
  if (status) return status.id;
  const first = await prisma.leadStatus.findFirst({
    where: { clientId },
    orderBy: { order: "asc" },
  });
  return first?.id ?? null;
}
