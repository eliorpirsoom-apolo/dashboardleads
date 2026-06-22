import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { reportMonths } from "@/lib/seo";

export const dynamic = "force-dynamic";

const VALID_STATUS = new Set(["done", "planned"]);

// GET /api/seo/tasks?clientId=<id>
// All tasks for a client, newest first (for the in-dashboard editor).
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const clientId = searchParams.get("clientId");
    if (!clientId) {
      return NextResponse.json({ error: "clientId נדרש" }, { status: 400 });
    }
    const tasks = await prisma.seoTask.findMany({
      where: { clientId },
      orderBy: [{ dueMonth: "desc" }, { createdAt: "desc" }],
    });
    return NextResponse.json({ tasks });
  } catch (err) {
    console.error("[api/seo/tasks GET]", err);
    return NextResponse.json(
      { error: "Failed to load tasks" },
      { status: 500 }
    );
  }
}

// POST /api/seo/tasks — create a task.
// Body: { clientId, title, status: "done"|"planned", dueMonth?: "yyyy-MM" }
// dueMonth defaults to this month for "done" and next month for "planned".
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const clientId = String(body.clientId ?? "");
    const title = String(body.title ?? "").trim();
    const status = String(body.status ?? "planned");
    if (!clientId || !title) {
      return NextResponse.json(
        { error: "clientId ו-title נדרשים" },
        { status: 400 }
      );
    }
    if (!VALID_STATUS.has(status)) {
      return NextResponse.json({ error: "status לא תקין" }, { status: 400 });
    }
    const { thisMonth, nextMonth } = reportMonths();
    const dueMonth =
      typeof body.dueMonth === "string" && /^\d{4}-\d{2}$/.test(body.dueMonth)
        ? body.dueMonth
        : status === "done"
          ? thisMonth
          : nextMonth;

    const task = await prisma.seoTask.create({
      data: { clientId, title, status, dueMonth },
    });
    return NextResponse.json({ task }, { status: 201 });
  } catch (err) {
    console.error("[api/seo/tasks POST]", err);
    return NextResponse.json(
      { error: "Failed to create task" },
      { status: 500 }
    );
  }
}
