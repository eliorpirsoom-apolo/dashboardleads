import { NextResponse } from "next/server";
import { z } from "zod";
import { handle, requireUser, scopeClientId, readJson, ApiError } from "@/lib/api";
import { makeFileKey, presignUpload } from "@/lib/storage";

export const dynamic = "force-dynamic";

const MAX_SIZE = 25 * 1024 * 1024; // 25MB

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
  const clientId = scopeClientId(user, body.clientId);

  if (body.size > MAX_SIZE) {
    throw new ApiError(413, "קובץ גדול מדי (מקסימום 25MB)");
  }

  const key = makeFileKey(clientId, body.category, body.fileName);
  const target = await presignUpload(key, body.mimeType);
  return NextResponse.json({ target, key });
});
