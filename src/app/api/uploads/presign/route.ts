import { NextResponse } from "next/server";
import { z } from "zod";
import { handle, requireUser, scopeClientId, readJson, ApiError } from "@/lib/api";
import { makeFileKey, presignUpload } from "@/lib/storage";

export const dynamic = "force-dynamic";

const MAX_SIZE = 100 * 1024 * 1024; // 100MB — ההעלאה ישירות ל-R2, לא דרך השרת

const Presign = z.object({
  clientId: z.string().optional(),
  category: z.string().min(1).max(40),
  fileName: z.string().min(1).max(200),
  mimeType: z.string().min(1).max(100),
  size: z.number().int().min(1),
});

// POST /api/uploads/presign — where should the browser PUT the bytes?
export const POST = handle(async (req) => {
  const user = await requireUser();
  const body = Presign.parse(await readJson(req));

  if (body.size > MAX_SIZE) {
    throw new ApiError(413, "קובץ גדול מדי (מקסימום 100MB)");
  }

  // הצעות מחיר: קבצים של המשרד עצמו (בלי לקוח) — namespace נפרד.
  if (body.category === "quote") {
    if (user.role !== "ADMIN") throw new ApiError(403, "צד משרד בלבד");
    const safe = body.fileName.replace(/[^\w.\-֐-׿]+/g, "_").slice(-120);
    const key = `agency/quotes/${crypto.randomUUID()}-${safe}`;
    const target = await presignUpload(key, body.mimeType);
    return NextResponse.json({ target, key });
  }

  const clientId = scopeClientId(user, body.clientId);
  const key = makeFileKey(clientId, body.category, body.fileName);
  const target = await presignUpload(key, body.mimeType);
  return NextResponse.json({ target, key });
});
