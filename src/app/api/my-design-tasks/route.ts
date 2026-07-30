import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { handle, requireUser, ApiError } from "@/lib/api";

export const dynamic = "force-dynamic";

// GET /api/my-design-tasks — עיצובים של הלקוח הממתינים לאישורו (צד לקוח).
export const GET = handle(async () => {
  const user = await requireUser();
  if (user.role === "ADMIN" || !user.clientId) throw new ApiError(400, "צד לקוח בלבד");
  const tasks = await prisma.designTask.findMany({
    where: { clientId: user.clientId, status: "sent_to_client" },
    orderBy: { clientNotifiedAt: "desc" },
    include: {
      assets: {
        where: { fileKey: { not: null }, kind: "deliverable" },
        orderBy: { createdAt: "desc" },
        select: { id: true, fileName: true, round: true },
      },
      messages: { orderBy: { createdAt: "asc" } },
    },
  });
  return NextResponse.json({ tasks });
});
