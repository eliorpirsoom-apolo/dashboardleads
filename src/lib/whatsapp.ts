import { prisma } from "./prisma";

// מספר ישראלי → פורמט בינ"ל (972, בלי + וללא 0 מוביל).
export function waIntl(phone: string): string {
  const digits = (phone || "").replace(/\D/g, "");
  if (digits.startsWith("972")) return digits;
  if (digits.startsWith("0")) return `972${digits.slice(1)}`;
  return digits;
}

export function whatsappConfigured(): boolean {
  return Boolean(process.env.GREENAPI_ID_INSTANCE && process.env.GREENAPI_API_TOKEN);
}

// שליחת הודעת וואטסאפ דרך Green API. מחזיר את idMessage לשמירה/דדופ.
export async function sendWhatsappRaw(
  to: string,
  body: string
): Promise<{ ok: boolean; idMessage?: string; error?: string }> {
  if (!whatsappConfigured()) return { ok: false, error: "וואטסאפ אינו מוגדר" };
  const id = process.env.GREENAPI_ID_INSTANCE!;
  const token = process.env.GREENAPI_API_TOKEN!;
  const base = (process.env.GREENAPI_API_URL || "https://api.green-api.com").replace(/\/$/, "");
  const intl = waIntl(to);
  if (!intl) return { ok: false, error: "מספר לא תקין" };
  try {
    const res = await fetch(`${base}/waInstance${id}/sendMessage/${token}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chatId: `${intl}@c.us`, message: body }),
    });
    const text = await res.text();
    if (!res.ok) return { ok: false, error: `Green API HTTP ${res.status}: ${text.slice(0, 200)}` };
    let idMessage: string | undefined;
    try {
      idMessage = JSON.parse(text)?.idMessage;
    } catch {
      /* ignore */
    }
    return { ok: true, idMessage };
  } catch (e: any) {
    return { ok: false, error: String(e?.message || e).slice(0, 200) };
  }
}

// זיהוי הלקוח מתוך מספר טלפון נכנס (השוואה מנורמלת מול טלפון איש קשר / משתמשי הלקוח).
export async function resolveClientIdByPhone(phone: string): Promise<string | null> {
  const target = waIntl(phone);
  if (!target) return null;
  const [clients, users] = await Promise.all([
    prisma.client.findMany({ where: { contactPhone: { not: null } }, select: { id: true, contactPhone: true } }),
    prisma.user.findMany({
      where: { phone: { not: null }, clientId: { not: null } },
      select: { clientId: true, phone: true },
    }),
  ]);
  for (const c of clients) {
    if (c.contactPhone && waIntl(c.contactPhone) === target) return c.id;
  }
  for (const u of users) {
    if (u.phone && u.clientId && waIntl(u.phone) === target) return u.clientId;
  }
  return null;
}

// טלפון הוואטסאפ של לקוח (איש קשר, או המשתמש הפעיל הראשון עם טלפון).
export async function clientWhatsappPhone(clientId: string): Promise<string | null> {
  const client = await prisma.client.findUnique({
    where: { id: clientId },
    select: {
      contactPhone: true,
      users: { where: { active: true, phone: { not: null } }, select: { phone: true }, take: 1 },
    },
  });
  return client?.contactPhone || client?.users?.[0]?.phone || null;
}
