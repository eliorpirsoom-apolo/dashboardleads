import { NextResponse } from "next/server";
import { handle, requireUser, scopeClientId, ApiError } from "@/lib/api";
import { makeFileKey, putObject } from "@/lib/storage";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Same-origin upload proxy: the browser POSTs the file here and the server
// streams it to storage. Avoids bucket CORS entirely. Vercel caps request
// bodies at ~4.5MB — plenty for quotes/contracts/receipts.
const MAX_SIZE = 4 * 1024 * 1024;

// POST /api/uploads/direct  (multipart/form-data: file, category, clientId?)
export const POST = handle(async (req) => {
  const user = await requireUser();
  const form = await req.formData();
  const file = form.get("file");
  const category = String(form.get("category") ?? "");
  if (!(file instanceof File)) throw new ApiError(400, "לא צורף קובץ");
  if (!category) throw new ApiError(400, "חסרה קטגוריה");
  if (file.size > MAX_SIZE) {
    throw new ApiError(413, "קובץ גדול מדי (מקסימום 4MB)");
  }

  const mimeType = file.type || "application/octet-stream";
  const bytes = Buffer.from(await file.arrayBuffer());

  let key: string;
  if (category === "quote") {
    if (user.role !== "ADMIN") throw new ApiError(403, "צד משרד בלבד");
    const safe = file.name.replace(/[^\w.\-֐-׿]+/g, "_").slice(-120);
    key = `agency/quotes/${crypto.randomUUID()}-${safe}`;
  } else {
    const clientId = scopeClientId(user, String(form.get("clientId") ?? ""));
    key = makeFileKey(clientId, category, file.name);
  }

  await putObject(key, bytes, mimeType);
  return NextResponse.json({
    key,
    fileName: file.name,
    mimeType,
    size: file.size,
  });
});
