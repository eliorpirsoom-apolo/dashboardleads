import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// PATCH /api/clients/:id — update a client's name / Google property linkage.
export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const body = await request.json();
    const data: Record<string, string | null> = {};
    if (typeof body.name === "string") data.name = body.name.trim();
    if ("gscProperty" in body)
      data.gscProperty = body.gscProperty?.trim() || null;
    if ("ga4PropertyId" in body)
      data.ga4PropertyId = body.ga4PropertyId?.trim() || null;

    const client = await prisma.client.update({
      where: { id: params.id },
      data,
      select: {
        id: true,
        name: true,
        gscProperty: true,
        ga4PropertyId: true,
      },
    });
    return NextResponse.json({ client });
  } catch (err) {
    console.error("[api/clients PATCH]", err);
    return NextResponse.json(
      { error: "Failed to update client" },
      { status: 500 }
    );
  }
}

// DELETE /api/clients/:id — remove a client (and its tasks, via cascade).
export async function DELETE(
  _request: Request,
  { params }: { params: { id: string } }
) {
  try {
    await prisma.client.delete({ where: { id: params.id } });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[api/clients DELETE]", err);
    return NextResponse.json(
      { error: "Failed to delete client" },
      { status: 500 }
    );
  }
}
