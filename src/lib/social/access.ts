import { ApiError, requireAdmin } from "@/lib/api";
import { canAccessAdminModule } from "@/lib/adminModules";
import type { SessionUser } from "@/lib/auth";

// גארד API של תיבת המענה החברתי: צוות המשרד בלבד (מנהל תמיד; עובד — רק אם
// המודול "תיבת מענה" מאושר לו בהרשאות).
export async function requireSocialAccess(): Promise<SessionUser> {
  const user = await requireAdmin();
  if (!canAccessAdminModule(user, "social")) {
    throw new ApiError(403, "אין הרשאה לתיבת המענה");
  }
  return user;
}
