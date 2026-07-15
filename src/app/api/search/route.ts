import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { handle, requireAdmin } from "@/lib/api";

export const dynamic = "force-dynamic";

// GET /api/search?q — global agency search: clients + leads by name/phone/email.
export const GET = handle(async (req) => {
  await requireAdmin();
  const q = (new URL(req.url).searchParams.get("q") ?? "").trim();
  if (q.length < 2) return NextResponse.json({ clients: [], leads: [] });

  const digits = q.replace(/[^\d]/g, "");
  const [clients, leads] = await Promise.all([
    prisma.client.findMany({
      where: {
        OR: [
          { name: { contains: q } },
          { company: { contains: q } },
          { contactName: { contains: q } },
          ...(digits.length >= 4 ? [{ contactPhone: { contains: digits } }] : []),
        ],
      },
      select: { id: true, name: true, type: true, color: true, active: true },
      take: 6,
    }),
    prisma.lead.findMany({
      where: {
        archived: false,
        OR: [
          { fullName: { contains: q } },
          { email: { contains: q.toLowerCase() } },
          ...(digits.length >= 4 ? [{ phone: { contains: digits } }] : []),
        ],
      },
      select: {
        id: true,
        number: true,
        fullName: true,
        phone: true,
        client: { select: { id: true, name: true } },
      },
      orderBy: { receivedAt: "desc" },
      take: 8,
    }),
  ]);

  return NextResponse.json({ clients, leads });
});
