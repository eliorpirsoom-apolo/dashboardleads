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
      return await prisma.$transaction(async (tx) => {
        const last = await tx.lead.findFirst({
          where: { clientId: data.clientId },
          orderBy: { number: "desc" },
          select: { number: true },
        });
        return tx.lead.create({
          data: { ...data, number: (last?.number ?? 0) + 1 },
        });
      });
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
