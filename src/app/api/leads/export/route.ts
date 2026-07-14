import { prisma } from "@/lib/prisma";
import { handle, requireUser, scopeClientId } from "@/lib/api";
import { buildLeadWhere } from "@/lib/leadFilters";
import { channelLabel } from "@/lib/defaults";

export const dynamic = "force-dynamic";

function csvCell(v: unknown): string {
  const s = v === null || v === undefined ? "" : String(v);
  return `"${s.replace(/"/g, '""')}"`;
}

// GET /api/leads/export?clientId&... — CSV with UTF-8 BOM (Hebrew-safe Excel).
export const GET = handle(async (req) => {
  const user = await requireUser();
  const p = new URL(req.url).searchParams;
  const clientId = scopeClientId(user, p.get("clientId"));

  const fields = await prisma.customFieldDef.findMany({
    where: { clientId, active: true },
    orderBy: { order: "asc" },
  });

  const leads = await prisma.lead.findMany({
    where: buildLeadWhere(clientId, p),
    orderBy: { receivedAt: "desc" },
    take: 5000,
    include: {
      status: { select: { name: true } },
      campaign: { select: { name: true } },
      unitType: { select: { name: true } },
    },
  });

  const headers = [
    "מס' ליד", "תאריך", "שם", "טלפון", "אימייל", "עיר", "סטטוס",
    "קמפיין", "קהל", "מודעה", "ערוץ", "פלטפורמה", "סוג", "הסכמה לדיוור",
    "טיפוס דירה",
    ...fields.map((f) => f.label),
  ];

  const rows = leads.map((l) => {
    const data = l.data ? JSON.parse(l.data) : {};
    return [
      l.number,
      new Date(l.receivedAt).toLocaleString("he-IL"),
      l.fullName, l.phone, l.email, l.city,
      l.status?.name,
      l.campaign?.name ?? l.campaignLabel,
      l.audience, l.adName,
      channelLabel(l.channel), l.platform,
      l.kind === "call" ? "טלפוני" : l.kind === "whatsapp" ? "וואטסאפ" : "טופס",
      l.consent ? "כן" : "לא",
      l.unitType?.name,
      ...fields.map((f) => {
        const v = data[f.key];
        return typeof v === "boolean" ? (v ? "כן" : "לא") : v;
      }),
    ]
      .map(csvCell)
      .join(",");
  });

  const csv = "﻿" + headers.map(csvCell).join(",") + "\n" + rows.join("\n");
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="leads-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
});
