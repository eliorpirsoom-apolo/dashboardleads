import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser, ApiError } from "@/lib/api";
import { presignDownload, readLocalObject, r2Configured } from "@/lib/storage";

export const dynamic = "force-dynamic";

// GET /api/recordings/[leadId] — מגיש את קובץ ההקלטה השמור אצלנו (R2/מקומי).
// נגיש למשרד, וללקוח רק עבור לידים שלו.
export async function GET(_req: Request, { params }: { params: { leadId: string } }) {
  try {
    const user = await requireUser();
    const lead = await prisma.lead.findUnique({
      where: { id: params.leadId },
      select: { clientId: true, callRecordingKey: true },
    });
    if (!lead || !lead.callRecordingKey) throw new ApiError(404, "הקלטה לא נמצאה");
    if (user.role !== "ADMIN" && user.clientId !== lead.clientId) {
      throw new ApiError(403, "אין הרשאה");
    }

    if (r2Configured()) {
      const url = await presignDownload(lead.callRecordingKey, "recording");
      if (url) return NextResponse.redirect(url);
    }
    const bytes = await readLocalObject(lead.callRecordingKey);
    return new NextResponse(new Uint8Array(bytes), {
      headers: { "Content-Type": "audio/mpeg", "Cache-Control": "private, max-age=600" },
    });
  } catch (err) {
    const status = err instanceof ApiError ? err.status : 500;
    return NextResponse.json(
      { error: err instanceof ApiError ? err.message : "שגיאה" },
      { status }
    );
  }
}
