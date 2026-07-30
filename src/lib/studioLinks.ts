import { randomUUID, randomBytes } from "crypto";
import { prisma } from "./prisma";
import { sendMessage } from "./messaging";
import { parseMsgConfig, effectiveFlags } from "./messagingConfig";

export const STUDIO_APP_URL = process.env.APP_BASE_URL || "https://dashboard-leads-apollo13.vercel.app";

// קישור ללקוח: קישור-אישור ללא התחברות אם יש טוקן, אחרת פורטל האישורים.
export function clientApprovalUrl(token: string | null | undefined): string {
  return token
    ? `${STUDIO_APP_URL}/studio/approve/${token}`
    : `${STUDIO_APP_URL}/app/studio`;
}

// מבטיח שלמשימה יש טוקן קישור-אישור (מייצר אקראי ובלתי-ניחוש אם חסר).
export async function ensureApprovalToken(taskId: string): Promise<string> {
  const t = await prisma.designTask.findUnique({
    where: { id: taskId },
    select: { approvalToken: true },
  });
  if (t?.approvalToken) return t.approvalToken;
  const token = (randomUUID() + randomBytes(9).toString("hex")).replace(/-/g, "");
  await prisma.designTask.update({ where: { id: taskId }, data: { approvalToken: token } });
  return token;
}

// התראה על הודעה חדשה בצ'אט: המשרד→ללקוח (מייל+וואטסאפ לפי הרשאות), הלקוח→למעצב/ת (מייל).
export async function notifyNewDesignMessage(
  taskId: string,
  authorSide: "agency" | "client",
  body: string
): Promise<void> {
  const task = await prisma.designTask.findUnique({
    where: { id: taskId },
    select: {
      id: true,
      title: true,
      clientId: true,
      approvalToken: true,
      client: {
        select: {
          messagingConfig: true,
          users: { where: { active: true }, select: { email: true, phone: true } },
        },
      },
      designer: { select: { email: true } },
    },
  });
  if (!task) return;
  const snippet = body.length > 300 ? `${body.slice(0, 300)}…` : body;

  if (authorSide === "agency") {
    const token = task.approvalToken || (await ensureApprovalToken(task.id));
    const url = clientApprovalUrl(token);
    const eff = effectiveFlags(parseMsgConfig(task.client?.messagingConfig));
    const text = `הודעה חדשה מהסטודיו לגבי "${task.title}":\n${snippet}\n\nלצפייה ולתגובה: ${url}`;
    for (const u of task.client?.users ?? []) {
      if (u.email) {
        await sendMessage({
          channel: "email",
          to: u.email,
          subject: "💬 הודעה חדשה מהסטודיו",
          body: text,
          kind: "automation",
          clientId: task.clientId,
        }).catch(() => {});
      }
      if (eff.whatsapp && u.phone) {
        await sendMessage({ channel: "whatsapp", to: u.phone, body: text, kind: "automation", clientId: task.clientId }).catch(() => {});
      }
    }
  } else if (task.designer?.email) {
    await sendMessage({
      channel: "email",
      to: task.designer.email,
      subject: `💬 הלקוח הגיב — ${task.title}`,
      body: `הלקוח כתב לגבי "${task.title}":\n${snippet}`,
      kind: "automation",
      clientId: task.clientId,
    }).catch(() => {});
  }
}

// התראה על הודעה בערוץ הפנימי (משרד): נשלחת לצוות המשימה (מעצב/ת + פותח/ת הבריף) מלבד השולח.
export async function notifyInternalDesignMessage(
  taskId: string,
  authorId: string,
  body: string
): Promise<void> {
  const task = await prisma.designTask.findUnique({
    where: { id: taskId },
    select: {
      title: true,
      clientId: true,
      designer: { select: { id: true, email: true } },
      createdBy: { select: { id: true, email: true } },
    },
  });
  if (!task) return;
  const snippet = body.length > 300 ? `${body.slice(0, 300)}…` : body;
  const recipients = new Map<string, string>(); // email → dedup
  for (const u of [task.designer, task.createdBy]) {
    if (u?.email && u.id !== authorId) recipients.set(u.email, u.email);
  }
  const url = `${STUDIO_APP_URL}/admin/studio`;
  for (const email of recipients.keys()) {
    await sendMessage({
      channel: "email",
      to: email,
      subject: `🗂️ עדכון פנימי על עיצוב — ${task.title}`,
      body: `הודעה פנימית חדשה על "${task.title}":\n${snippet}\n\nלמערכת: ${url}`,
      kind: "automation",
      clientId: task.clientId,
    }).catch(() => {});
  }
}
