// ---------------------------------------------------------------------------
// הרשאות דיוור פר-לקוח, דו-שכבתי:
//   allowed — המשרד מגדיר מה הלקוח *רשאי*.
//   enabled — הלקוח מדליק/מכבה מתוך המותר.
//   אפקטיבי = allowed ∧ enabled.
// נשמר כ-JSON ב-Client.messagingConfig.
// ---------------------------------------------------------------------------

export type MsgFlags = {
  broadcast: boolean; // דיוור יזום ללקוחות הלקוח
  leadAlerts: boolean; // התראות על לידים חדשים
  unhandledAlerts: boolean; // הסלמת SLA למנהלי הלקוח על ליד שלא טופל
  email: boolean;
  sms: boolean;
  whatsapp: boolean;
};
export type MsgConfig = { allowed: MsgFlags; enabled: MsgFlags };

// unhandledAlerts נולד אחרי שהפיצ'ר כבר עבד לכולם — לכן ברירת המחדל שלו
// (כשהמפתח חסר ב-JSON) היא "פעיל", והמשרד/הלקוח מכבים במפורש.
const EMPTY: MsgFlags = {
  broadcast: false,
  leadAlerts: false,
  unhandledAlerts: true,
  email: false,
  sms: false,
  whatsapp: false,
};

export const MSG_KEYS = ["broadcast", "leadAlerts", "unhandledAlerts", "email", "sms", "whatsapp"] as const;
export const MSG_CHANNELS = ["email", "sms", "whatsapp"] as const;

function coerce(o: any): MsgFlags {
  const f: any = { ...EMPTY };
  if (o && typeof o === "object") {
    for (const k of MSG_KEYS) f[k] = o[k] === undefined ? EMPTY[k] : Boolean(o[k]);
  }
  return f;
}

export function parseMsgConfig(raw: string | null | undefined): MsgConfig {
  try {
    const j = raw ? JSON.parse(raw) : {};
    return { allowed: coerce(j.allowed), enabled: coerce(j.enabled) };
  } catch {
    return { allowed: { ...EMPTY }, enabled: { ...EMPTY } };
  }
}

/** אפקטיבי = מותר ∧ פעיל. */
export function effectiveFlags(cfg: MsgConfig): MsgFlags {
  const { allowed: a, enabled: e } = cfg;
  const out: any = {};
  for (const k of MSG_KEYS) out[k] = a[k] && e[k];
  return out;
}

/** הערוצים הפעילים בפועל (מייל/SMS/וואטסאפ). */
export function effectiveChannels(cfg: MsgConfig): ("email" | "sms" | "whatsapp")[] {
  const eff = effectiveFlags(cfg);
  return MSG_CHANNELS.filter((c) => eff[c]);
}

export function serializeMsgConfig(cfg: MsgConfig): string {
  return JSON.stringify({ allowed: coerce(cfg.allowed), enabled: coerce(cfg.enabled) });
}
