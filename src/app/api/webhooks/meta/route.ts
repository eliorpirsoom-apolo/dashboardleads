import { NextResponse } from "next/server";
import {
  metaEnabled,
  metaVerifyToken,
  verifyMetaSignature,
  processLeadgenEvent,
} from "@/lib/integrations/metaLeads";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// ---------------------------------------------------------------------------
// וובהוק Meta (Facebook Lead Ads):
//   GET  — אימות חד-פעמי בעת הגדרת הוובהוק בקונסולת המפתחים (hub.challenge).
//   POST — אירועי leadgen בזמן אמת; חתימת X-Hub-Signature-256 מאומתת מול
//          ה-App Secret לפני כל עיבוד. לכל אירוע: משיכת הליד מ-Graph והזרמה
//          לצינור הקליטה של העמוד המחובר.
// ---------------------------------------------------------------------------

export async function GET(req: Request) {
  const sp = new URL(req.url).searchParams;
  if (
    sp.get("hub.mode") === "subscribe" &&
    sp.get("hub.verify_token") === metaVerifyToken()
  ) {
    return new Response(sp.get("hub.challenge") ?? "", { status: 200 });
  }
  return NextResponse.json({ error: "אימות נכשל" }, { status: 403 });
}

export async function POST(req: Request) {
  if (!metaEnabled()) {
    return NextResponse.json({ error: "Meta לא מוגדר" }, { status: 400 });
  }
  const raw = await req.text();
  if (!verifyMetaSignature(raw, req.headers.get("x-hub-signature-256"))) {
    return NextResponse.json({ error: "חתימה לא תקינה" }, { status: 403 });
  }

  let body: any;
  try {
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "גוף לא תקין" }, { status: 400 });
  }

  const results: { ok: boolean; note: string }[] = [];
  for (const entry of body?.entry ?? []) {
    for (const change of entry?.changes ?? []) {
      if (change?.field !== "leadgen") continue;
      const pageId = String(change.value?.page_id ?? entry.id ?? "");
      const leadgenId = String(change.value?.leadgen_id ?? "");
      if (!pageId || !leadgenId) continue;
      results.push(await processLeadgenEvent(pageId, leadgenId));
    }
  }
  return NextResponse.json({ ok: true, processed: results.length });
}
