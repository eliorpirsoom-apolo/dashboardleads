import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireManager } from "@/lib/permissions";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

// זמני לאבחון: מוריד בשרת את קישור ההקלטה של ליד ומחזיר מה callindex מחזיר.
export async function GET(req: Request) {
  await requireManager();
  const leadId = new URL(req.url).searchParams.get("leadId") || "";
  const lead = await prisma.lead.findUnique({
    where: { id: leadId },
    select: { callRecordingUrl: true },
  });
  if (!lead?.callRecordingUrl) return NextResponse.json({ error: "no url" }, { status: 404 });
  try {
    const res = await fetch(lead.callRecordingUrl, {
      headers: { "User-Agent": "Mozilla/5.0", Accept: "*/*" },
    });
    const buf = Buffer.from(await res.arrayBuffer());
    const ct = res.headers.get("content-type");
    const isText = (ct || "").includes("text") || (ct || "").includes("html");
    return NextResponse.json({
      status: res.status,
      ok: res.ok,
      contentType: ct,
      bytes: buf.length,
      textHead: isText ? buf.toString("utf8").slice(0, 300) : null,
    });
  } catch (err) {
    return NextResponse.json({ fetchError: String((err as Error)?.message ?? err) });
  }
}
