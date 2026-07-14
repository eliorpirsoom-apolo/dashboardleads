import { NextResponse } from "next/server";
import { verifyLocalUploadToken, writeLocalObject } from "@/lib/storage";

export const dynamic = "force-dynamic";

// Local-dev upload sink (production uses presigned PUT straight to R2).
// The HMAC token from /api/uploads/presign authorizes the key.
export async function PUT(req: Request) {
  const url = new URL(req.url);
  const key = url.searchParams.get("key") ?? "";
  const exp = url.searchParams.get("exp") ?? "";
  const sig = url.searchParams.get("sig") ?? "";

  if (!key || !verifyLocalUploadToken(key, exp, sig)) {
    return NextResponse.json({ error: "טוקן העלאה לא תקין" }, { status: 403 });
  }
  if (key.includes("..")) {
    return NextResponse.json({ error: "מפתח לא חוקי" }, { status: 400 });
  }

  const buf = Buffer.from(await req.arrayBuffer());
  if (buf.length > 25 * 1024 * 1024) {
    return NextResponse.json({ error: "קובץ גדול מדי" }, { status: 413 });
  }
  await writeLocalObject(key, buf);
  return NextResponse.json({ ok: true, key });
}
