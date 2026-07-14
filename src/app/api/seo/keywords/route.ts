import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { handle, requireUser, scopeClientId, readJson, ApiError } from "@/lib/api";

export const dynamic = "force-dynamic";

const CreateKeyword = z.object({
  clientId: z.string().optional(),
  keyword: z.string().min(1, "חסרה מילת מפתח").max(120),
});

// POST /api/seo/keywords — track a keyword's Google position.
export const POST = handle(async (req) => {
  const user = await requireUser();
  const body = CreateKeyword.parse(await readJson(req));
  const clientId = scopeClientId(user, body.clientId);

  const keyword = body.keyword.trim();
  const exists = await prisma.seoKeyword.findUnique({
    where: { clientId_keyword: { clientId, keyword } },
  });
  if (exists) {
    if (!exists.active) {
      await prisma.seoKeyword.update({
        where: { id: exists.id },
        data: { active: true },
      });
      return NextResponse.json({ keyword: exists });
    }
    throw new ApiError(409, "מילת המפתח כבר במעקב");
  }

  const created = await prisma.seoKeyword.create({
    data: { clientId, keyword },
  });
  return NextResponse.json({ keyword: created }, { status: 201 });
});

// DELETE /api/seo/keywords?id=... — stop tracking (keeps history).
export const DELETE = handle(async (req) => {
  const user = await requireUser();
  const id = new URL(req.url).searchParams.get("id");
  if (!id) throw new ApiError(400, "חסר מזהה");
  const kw = await prisma.seoKeyword.findUnique({ where: { id } });
  if (!kw) throw new ApiError(404, "מילת מפתח לא נמצאה");
  scopeClientId(user, kw.clientId);
  await prisma.seoKeyword.update({ where: { id }, data: { active: false } });
  return NextResponse.json({ ok: true });
});
