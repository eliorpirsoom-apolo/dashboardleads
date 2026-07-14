import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { syncSearchConsole, syncGa4 } from "@/lib/integrations/googleData";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Daily SEO sync (Vercel Cron, 04:00) — pulls fresh Search Console + GA4
// data for every connected client so dashboards load instantly.
function authorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return process.env.NODE_ENV !== "production";
  return req.headers.get("authorization") === `Bearer ${secret}`;
}

export async function GET(req: Request) {
  if (!authorized(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const integrations = await prisma.integration.findMany({
    where: {
      kind: { in: ["search_console", "ga4"] },
      status: { in: ["connected", "error"] },
      clientId: { not: null },
    },
  });

  const results: Record<string, string> = {};
  for (const integration of integrations) {
    const key = `${integration.clientId}:${integration.kind}`;
    try {
      const rows =
        integration.kind === "search_console"
          ? await syncSearchConsole(integration.clientId!, 3)
          : await syncGa4(integration.clientId!, 3);
      results[key] = `ok (${rows})`;
    } catch (err: any) {
      results[key] = `error: ${String(err?.message ?? err).slice(0, 100)}`;
    }
  }

  return NextResponse.json({ synced: integrations.length, results });
}
