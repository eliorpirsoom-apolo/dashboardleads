import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const VALID_STATUS = new Set(["done", "planned"]);

// PATCH /api/seo/tasks/:id — edit a task (title / status / dueMonth).
export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const body = await request.json();
    const data: Record<string, string> = {};
    if (typeof body.title === "string") data.title = body.title.trim();
    if (typeof body.status === "string") {
      if (!VALID_STATUS.has(body.status)) {
        return NextResponse.json({ error: "status לא תקין" }, { status: 400 });
      }
      data.status = body.status;
    }
    if (typeof body.dueMonth === "string" && /^\d{4}-\d{2}$/.test(body.dueMonth)) {
      data.dueMonth = body.dueMonth;
    }
    const task = await prisma.seoTask.update({
      where: { id: params.id },
      data,
    });
    return NextResponse.json({ task });
  } catch (err) {
    console.error("[api/seo/tasks PATCH]", err);
    return NextResponse.json(
      { error: "Failed to update task" },
      { status: 500 }
    );
  }
}

// DELETE /api/seo/tasks/:id — remove a task.
export async function DELETE(
  _request: Request,
  { params }: { params: { id: string } }
) {
  try {
    await prisma.seoTask.delete({ where: { id: params.id } });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[api/seo/tasks DELETE]", err);
    return NextResponse.json(
      { error: "Failed to delete task" },
      { status: 500 }
    );
  }
}
