import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { handle, requireAdmin, readJson, ApiError } from "@/lib/api";
import { createDefaultStatuses } from "@/lib/defaults";
import { audit } from "@/lib/audit";

export const dynamic = "force-dynamic";

// צ'ק-ליסט אונבורדינג ברירת מחדל — נפתח לכל לקוח חדש שנכנס לעבודה.
const DEFAULT_ONBOARDING = [
  "קביעת ישיבת התנעה",
  "איסוף חומרים ונכסים מהלקוח",
  "חתימת הסכם ופרטי חיוב",
  "הקמת נכסים דיגיטליים (עמודים/מודעות/אתר)",
  "בניית תוכנית עבודה (גאנט) ל-6 חודשים",
];

const Approve = z.object({
  // לקוח קיים — או פרטים לפתיחת לקוח חדש.
  clientId: z.string().optional().nullable(),
  company: z.string().min(1).max(160).optional(),
  contactName: z.string().max(120).optional().nullable(),
  phone: z.string().max(30).optional().nullable(),
  email: z.string().email("אימייל לא תקין").optional().nullable(),
});

// POST /api/quotes/[id]/approve — הלקוח אישר: פותח לקוח+משתמש (אם חדש),
// מסמן את ההצעה "אושרה", ויוצר Engagement עם צ'ק-ליסט. הכל בטרנזקציה.
export const POST = handle(async (req, { params }: { params: { id: string } }) => {
  const actor = await requireAdmin();
  const body = Approve.parse(await readJson(req));
  const quote = await prisma.quote.findUnique({ where: { id: params.id } });
  if (!quote) throw new ApiError(404, "הצעת מחיר לא נמצאה");
  // כבר אושרה — לא פותחים ליווי פעמיים.
  const alreadyEng = await prisma.engagement.findUnique({ where: { quoteId: quote.id } });
  if (alreadyEng) return NextResponse.json({ engagement: alreadyEng, already: true });

  const result = await prisma.$transaction(async (tx) => {
    // 1. לקוח: קיים או חדש.
    let clientId = body.clientId || quote.clientId || null;
    if (!clientId) {
      const name = (body.company || quote.company || quote.recipient).trim();
      // שם לקוח ייחודי — הוספת סיומת אם כבר קיים.
      let uniqueName = name;
      for (let i = 2; await tx.client.findUnique({ where: { name: uniqueName } }); i++) {
        uniqueName = `${name} (${i})`;
      }
      const client = await tx.client.create({
        data: {
          name: uniqueName,
          type: "general",
          company: body.company || quote.company || null,
          contactName: body.contactName || null,
          contactEmail: body.email || quote.email || null,
          contactPhone: body.phone || quote.phone || null,
        },
      });
      await createDefaultStatuses(tx, client.id);
      clientId = client.id;

      // 2. משתמש ללקוח — כניסה עם Google בלבד (בלי סיסמה).
      const email = (body.email || quote.email || "").toLowerCase().trim();
      if (email && !(await tx.user.findUnique({ where: { email } }))) {
        await tx.user.create({
          data: {
            email,
            name: body.contactName || body.company || quote.recipient,
            role: "CLIENT",
            clientId: client.id,
            phone: body.phone || quote.phone || null,
            passwordHash: null,
          },
        });
      }
    }

    // 3. עדכון ההצעה + פרטי הקשר שהוזנו.
    await tx.quote.update({
      where: { id: quote.id },
      data: {
        status: "won",
        clientId,
        company: body.company ?? quote.company,
        phone: body.phone ?? quote.phone,
        email: body.email ?? quote.email,
      },
    });

    // 4. Engagement + צ'ק-ליסט.
    const engagement = await tx.engagement.create({
      data: {
        clientId,
        quoteId: quote.id,
        title: quote.title,
        tasks: {
          create: DEFAULT_ONBOARDING.map((title, i) => ({ title, order: i })),
        },
      },
    });
    return { engagement, clientId };
  });

  await audit(actor, "quote_approved", "quote", quote.id, quote.recipient);
  return NextResponse.json(result, { status: 201 });
});
