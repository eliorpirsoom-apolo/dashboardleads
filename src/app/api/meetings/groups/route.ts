import { NextResponse } from "next/server";
import { handle, requireAdmin } from "@/lib/api";
import { listWhatsappGroups } from "@/lib/whatsapp";

export const dynamic = "force-dynamic";

// GET /api/meetings/groups — קבוצות הוואטסאפ שהבוט של המשרד חבר בהן.
// (הבוט הוא מספר נפרד — רואה רק קבוצות שהוא משתתף בהן, לא את הקבוצות
// שבטלפון האישי.) לבחירת קבוצת הלקוח לשליחת סיכומים.
export const GET = handle(async () => {
  await requireAdmin();
  const groups = await listWhatsappGroups();
  return NextResponse.json({ groups });
});
