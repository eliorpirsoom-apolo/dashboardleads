import { NextResponse } from "next/server";
import { ingestInboundWhatsapp } from "@/lib/whatsapp";

export const dynamic = "force-dynamic";

// POST /api/webhooks/greenapi — קבלת הודעות וואטסאפ נכנסות מ-Green API.
// מאובטח בטוקן (Authorization: Bearer <GREENAPI_WEBHOOK_TOKEN>, או ?token=).
export async function POST(req: Request) {
  const secret = process.env.GREENAPI_WEBHOOK_TOKEN;
  if (!secret) return NextResponse.json({ error: "not configured" }, { status: 503 });
  const url = new URL(req.url);
  const auth = req.headers.get("authorization") || "";
  const bearer = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  const qToken = url.searchParams.get("token") || "";
  if (bearer !== secret && qToken !== secret) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let payload: any;
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ ok: true }); // גוף לא-תקין — לא מנסים שוב
  }

  try {
    const res = await ingestInboundWhatsapp(payload);
    return NextResponse.json({ ok: true, ...res });
  } catch (err) {
    console.error("[greenapi:webhook]", err);
    return NextResponse.json({ ok: true }); // תמיד 200 כדי שלא ינסה שוב אינסופית
  }
}
