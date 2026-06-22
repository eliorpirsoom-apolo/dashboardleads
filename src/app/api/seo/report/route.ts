import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { buildSeoReport } from "@/lib/seo";

export const dynamic = "force-dynamic";

// GET /api/seo/report?clientId=<id>
// Returns the full organic SEO report (Search Console + Analytics trends,
// climbing keywords, and the task lists) for a client.
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const clientId = searchParams.get("clientId");
    if (!clientId) {
      return NextResponse.json({ error: "clientId נדרש" }, { status: 400 });
    }
    const client = await prisma.client.findUnique({ where: { id: clientId } });
    if (!client) {
      return NextResponse.json({ error: "הלקוח לא נמצא" }, { status: 404 });
    }
    const report = await buildSeoReport(client);
    return NextResponse.json(report);
  } catch (err) {
    console.error("[api/seo/report]", err);
    return NextResponse.json(
      { error: "Failed to build report" },
      { status: 500 }
    );
  }
}
