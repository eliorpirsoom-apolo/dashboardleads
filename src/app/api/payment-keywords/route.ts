import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { handle, requireAdmin, readJson, ApiError } from "@/lib/api";
import { canAccessAdminModule } from "@/lib/adminModules";

export const dynamic = "force-dynamic";

async function guard() {
  const user = await requireAdmin();
  if (!canAccessAdminModule(user, "payments")) throw new ApiError(403, "אין הרשאה למודול התשלומים");
  return user;
}

// ברירת מחדל למילות סיווג — ניתנות לעריכה/מחיקה בדשבורד.
const DEFAULTS: { keyword: string; kind: string }[] = [
  { keyword: "ריטיינר", kind: "retainer" },
  { keyword: "ניהול", kind: "retainer" },
  { keyword: "חודשי", kind: "retainer" },
  { keyword: "קידום", kind: "retainer" },
  { keyword: "ליווי", kind: "retainer" },
  { keyword: "בניית אתר", kind: "oneoff" },
  { keyword: "אתר", kind: "oneoff" },
  { keyword: "עיצוב", kind: "oneoff" },
  { keyword: "לוגו", kind: "oneoff" },
  { keyword: "דף נחיתה", kind: "oneoff" },
  { keyword: "מיתוג", kind: "oneoff" },
  { keyword: "הקמה", kind: "oneoff" },
  { keyword: "חד פעמי", kind: "oneoff" },
];

// GET /api/payment-keywords — רשימת מילות הסיווג (זריעת ברירת מחדל בפעם הראשונה).
export const GET = handle(async () => {
  await guard();
  let keywords = await prisma.paymentKeyword.findMany({ orderBy: { createdAt: "asc" } });
  if (keywords.length === 0) {
    await prisma.paymentKeyword.createMany({ data: DEFAULTS });
    keywords = await prisma.paymentKeyword.findMany({ orderBy: { createdAt: "asc" } });
  }
  return NextResponse.json({ keywords });
});

const NewKeyword = z.object({
  keyword: z.string().min(1, "חסרה מילה").max(60),
  kind: z.enum(["retainer", "oneoff"]),
});

// POST /api/payment-keywords — הוספת מילת סיווג.
export const POST = handle(async (req) => {
  await guard();
  const b = NewKeyword.parse(await readJson(req));
  const keyword = b.keyword.trim();
  try {
    const created = await prisma.paymentKeyword.create({ data: { keyword, kind: b.kind } });
    return NextResponse.json({ keyword: created }, { status: 201 });
  } catch {
    throw new ApiError(409, "המילה כבר קיימת בסוג הזה");
  }
});
