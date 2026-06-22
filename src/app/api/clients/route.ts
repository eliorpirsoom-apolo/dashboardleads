import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// GET /api/clients — list all clients (for the report's client selector).
export async function GET() {
  try {
    const clients = await prisma.client.findMany({
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        gscProperty: true,
        ga4PropertyId: true,
      },
    });
    return NextResponse.json({ clients });
  } catch (err) {
    console.error("[api/clients GET]", err);
    return NextResponse.json(
      { error: "Failed to load clients" },
      { status: 500 }
    );
  }
}

// POST /api/clients — create a client.
// Body: { name, gscProperty?, ga4PropertyId? }
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const name = String(body.name ?? "").trim();
    if (!name) {
      return NextResponse.json({ error: "שם לקוח נדרש" }, { status: 400 });
    }
    const client = await prisma.client.create({
      data: {
        name,
        gscProperty: body.gscProperty?.trim() || null,
        ga4PropertyId: body.ga4PropertyId?.trim() || null,
      },
      select: {
        id: true,
        name: true,
        gscProperty: true,
        ga4PropertyId: true,
      },
    });
    return NextResponse.json({ client }, { status: 201 });
  } catch (err: unknown) {
    // Unique-constraint (duplicate name) -> 409.
    if (
      typeof err === "object" &&
      err !== null &&
      "code" in err &&
      (err as { code?: string }).code === "P2002"
    ) {
      return NextResponse.json(
        { error: "כבר קיים לקוח בשם זה" },
        { status: 409 }
      );
    }
    console.error("[api/clients POST]", err);
    return NextResponse.json(
      { error: "Failed to create client" },
      { status: 500 }
    );
  }
}
