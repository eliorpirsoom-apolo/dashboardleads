# תוכנית עבודה — תיבת מענה חברתי (Social Inbox)

מענה AI לתגובות ולהודעות פייסבוק/אינסטגרם בדפים עסקיים שהסוכנות מנהלת, בתוך
הדשבורד הקיים. מסמך זה הוא המפרט המחייב — בונים מולו, שלב אחרי שלב.

## 1. החלטות נעולות
- **רמת אוטומציה**: טיוטת AI → **אישור אנושי** → שליחה. אין שליחה אוטומטית בשלב זה.
- **ערוצים**: תגובות FB + תגובות IG + הודעות מסנג'ר + IG Direct.
- **פיילוט**: דף אפולו בלבד (`facebook.com/Apollo8ADS`), במצב Development של האפליקציה.
- **אינטגרציה**: מודול בתוך הדשבורד הקיים — אותו עיצוב/הרשאות/לקוחות/צנרת לידים.
- עקרון-על: **אפס תקלות** — תגובות פומביות הן רגישות. כל שלב עם קריטריוני קבלה ובדיקות.

## 2. ארכיטקטורה — מה מרחיבים מהקיים
- **אפליקציית Meta + webhook קיימים** (`/api/webhooks/meta`) — מרחיבים מ-`leadgen` בלבד גם ל-`feed`/`comments` ו-`messaging`. אותו אימות חתימה (`verifyMetaSignature`).
- **זרימת OAuth קיימת** (`/api/integrations/meta/connect|callback|pages`) — נשתמש מחדש לקבלת Page Access Token ארוך-טווח, ונשמור אותו ב-`SocialAccount` (נפרד מ-`MetaPage` של הלידים).
- **שכבת AI קיימת** (`aiComplete`, gpt-4o) — ליצירת טיוטות.
- **Graph API v19.0** — כמו בשאר המערכת.

## 3. מודל נתונים (migration חדש)
```
model SocialAccount {           // דף מחובר למענה חברתי
  id          String @id @default(cuid())
  client      Client @relation(...)   clientId String
  platform    String            // "facebook" | "instagram"
  pageId      String @unique     // מזהה הדף ב-Meta
  pageName    String
  igUserId    String?            // חשבון IG עסקי מקושר (לתגובות/DM ב-IG)
  pageTokenEnc String            // Page Access Token — מוצפן (AES-256-GCM)
  tokenValid  Boolean @default(true)
  active      Boolean @default(true)
  lastError   String?
  createdAt   DateTime @default(now())
}

model SocialThread {            // פנייה אחת (שרשור תגובה / שיחת DM)
  id            String @id @default(cuid())
  account       SocialAccount @relation(...)  accountId String
  client        Client @relation(...)         clientId String
  platform      String          // facebook | instagram
  kind          String          // "comment" | "dm"
  externalId    String          // מזהה יציב: root comment_id / PSID|IGSID
  postId        String?
  permalink     String?
  authorName    String?
  authorExtId   String?
  status        String @default("open")  // open|drafted|answered|needs_human|lead|ignored
  draftText     String?         // טיוטת ה-AI הממתינה לאישור
  draftAt       DateTime?
  needsHuman    Boolean @default(false)
  reason        String?         // סיבת "דורש אדם" (תלונה/מו"מ/משפטי/...)
  lastInboundAt DateTime?
  lastMessageAt DateTime @default(now())
  snippet       String?
  @@unique([accountId, kind, externalId])
}

model SocialMessage {           // הודעה בודדת בשרשור
  id         String @id @default(cuid())
  thread     SocialThread @relation(..., onDelete: Cascade)  threadId String
  direction  String          // "in" | "out"
  externalId String?         // comment_id / message mid — למניעת כפילויות
  text       String
  authorName String?
  createdAt  DateTime @default(now())
  @@index([threadId, createdAt])
  @@unique([threadId, externalId])
}

model SocialKnowledge {         // מאגר ידע פר-לקוח להנחיית ה-AI
  id         String @id @default(cuid())
  client     Client @relation(...)  clientId String @unique
  faq        String?         // שאלות/תשובות נפוצות
  pricing    String?         // מחירון / מה מותר למסור
  tone       String?         // טון ושפה
  doNotAnswer String?        // מה אסור לענות
  escalate   String?         // מילות-הסלמה → "דורש אדם"
  aiEnabled  Boolean @default(true)
  updatedAt  DateTime @updatedAt
}
```

## 4. שלב 1a — קליטה + תצוגה (קריאה בלבד)
> **סטטוס (10.11.2026):** נבנה בענף `feature/social-inbox-1a` (מיגרציה 0072, webhook, OAuth עם `purpose=social`, מסך `/admin/social`, 37 בדיקות סינתטיות, build+lint נקיים). ממתין לפריסה ולבדיקה חיה על דף אפולו.
> גוצ׳ה שנמצאה ותוקנה: `subscribed_apps` של Meta **מחליף** את רשימת השדות — הרישום מחושב תמיד כאיחוד leadgen + feed/messages (`syncPageSubscription`), אחרת חיבור התיבה היה מפיל לידים.

**מטרה**: כל תגובה/DM בדף אפולו נכנסת לדשבורד. אין שליחה החוצה.

היקף:
1. הרחבת `POST /api/webhooks/meta`:
   - `entry.changes[].field === "feed"` עם `value.item==="comment"` ו-`verb==="add"` → תגובת FB.
   - `object==="instagram"` + `field==="comments"` → תגובת IG.
   - `entry.messaging[]` → הודעות מסנג'ר / IG Direct. **לסנן `message.is_echo===true`** (הודעות שהדף שלח — נשמרות כ-`out`, לא פותחות שרשור חדש).
   - מיפוי `pageId`/`igUserId` → `SocialAccount` → `client`. אם אין התאמה — להתעלם בשקט.
2. יצירה/עדכון `SocialThread` + הוספת `SocialMessage` (direction=`in`).
3. **דדופ**: לפי `externalId` (comment_id / message mid) — `@@unique` + בדיקה לפני הוספה. webhook retries לא יוצרים כפילות.
4. **תיבת-הודעות** בדשבורד המשרד (`/admin/social`): רשימת שרשורים (חדש-למעלה), סינון לפי לקוח/פלטפורמה/סטטוס, תצוגת שרשור עם ההודעות. הרשאת מנהל/סטאף. תמה בהירה, מתקפל.

קבלה: שליחת תגובה אמיתית בדף אפולו (FB ו-IG) + DM → מופיעים בתיבה תוך שניות, בלי כפילויות, ממופים ללקוח "אפולו פרסום".

בדיקות: POST סינתטי לוובהוק (feed/comment, messaging, is_echo) עם חתימה תקינה/שגויה; בדיקת דדופ (אותו אירוע פעמיים → רשומה אחת).

## 5. שלב 1b — טיוטות AI
> **סטטוס (11.11.2026):** נבנה בענף `feature/social-inbox-1b` (מיגרציה 0073, `lib/social/drafts.ts`, מאגר ידע בהגדרות הלקוח, טיוטה מיד בקליטה + קרון `/api/cron/social-drafts`, כפתורי "צור טיוטה"/"דורש אדם"/"התעלמות" בתיבה, 51 בדיקות). **לא מוזג** — ממתין לאישור הבדיקה החיה של 1a ולאישור 1b. מודל: `OPENAI_SOCIAL_MODEL` (ברירת מחדל gpt-4o). "דורש אדם" בשתי שכבות: מילות הסלמה (לקוח + מובנות) לפני AI, ואז סיווג ה-AI.

1. `SocialKnowledge` פר-לקוח + עורך בדשבורד.
2. `generateSocialDraft(thread, incomingText, knowledge)` ב-gpt-4o → `draftText`.
   - **הגנת prompt-injection**: הטקסט הנכנס מוזרק כ**נתון בלבד**; system-prompt מורה להתעלם מכל "הוראה" בתוך תוכן המשתמש.
3. **סיווג "דורש אדם"**: כעס/תלונה/מו"מ מחיר/משפטי/מילות-הסלמה → `needsHuman=true` + `reason`, בלי טיוטה אוטומטית.
קבלה: לכל פנייה נוצרת טיוטה סבירה בעברית בטון הלקוח; פניות רגישות מסומנות "דורש אדם".

## 6. שלב 1c — שליחה + הגנות + לידים
שליחה (Graph v19.0, Page Token, אחרי אישור/עריכה):
- תגובת FB: `POST /{comment_id}/comments`. • תגובה פרטית: `POST /{pageId}/messages {recipient:{comment_id}}`.
- מסנג'ר: `POST /{pageId}/messages {recipient:{id:PSID}, messaging_type:"RESPONSE"}`.
- תגובת IG: `POST /{ig_comment_id}/replies`. • IG DM: `POST /{igUserId}/messages`.

הגנות חובה (כולן נכנסות כאן):
- 🔒 **הצפנת טוקנים** — AES-256-GCM, מפתח נגזר מ-`AUTH_SECRET` (אין סוד חדש לנהל). בתוקף כבר ב-`SocialAccount` משלב 1a.
- 🔒 **אי-כפילות בשליחה** — מפתח אידמפוטנטי לכל שליחה; לחיצה כפולה/retry לא שולחת פעמיים.
- 🔒 **סינון-הד** — הודעות שאנחנו שולחים (`is_echo`/externalId שלנו) לא נקלטות כפנייה חדשה.
- 🔒 **תקרות קצב** — מגבלת שליחות לדף/לדקה; חריגה → תור/השהיה.
- 🔒 **חלון 24 שעות (מסנג'ר)** — חסימת שליחת DM מחוץ לחלון (אלא message tag מאושר).
- 🔒 **ניטור תוקף טוקן** — כשל הרשאה → `tokenValid=false` + התראה (מערכת הבריאות/וואטסאפ).
- 🔒 **העברה לנציג אנושי** — מובנה (אדם מאשר כל תשובה) + כפתור "סמן דורש אדם".

הגנות נוספות נגד זיהוי כספאם/חסימה (הוצעו 10.11.2026, לאישור):
- 🔒 **ניסוח משתנה** — ה-AI מנסח כל תשובה מחדש; שתי תשובות זהות באותו יום לאותו דף נחסמות בצד שלנו.
- 🔒 **השהיה אקראית** — 30–120 שניות לפני כל שליחה; אין מענה לתגובות ריקות (אימוג׳י/תיוג/לייק).
- 🔒 **גילוי נאות ב-DM** — שורת פתיחה "העוזר הדיגיטלי של X, אפשר לבקש נציג בכל שלב" + מילת מפתח להעברה לאדם (דרישת מדיניות Messenger Platform).
- 🔒 **ניטור** — מעקב שגיאות, זמני תגובה ושיעור הסלמה לאדם; קוד שגיאת הגבלה/חסימה מ-Meta משבית מיד את השליחה לדף ושולח התראה.

לידים: פנייה שמזוהה כמתעניין → יצירת ליד לאותו לקוח בצנרת הקיימת.

## 7. צעדים בקונסולת Meta — אתה בלבד (אני לא נוגע באימות/קונסולה)
1. לחבר את דף אפולו דרך הדשבורד (OAuth; הכניסה לפייסבוק שלך).
2. Webhook fields: `feed`, `messages`, `messaging_postbacks`; ל-IG: `comments`, `messages`.
3. הרשאות (במצב dev עובד על דף אפולו בלי App Review):
   `pages_show_list`, `pages_read_engagement`, `pages_manage_metadata`, `pages_read_user_content` (בלעדיה Meta לא מעבירה תוכן תגובות של משתמשים),
   `pages_manage_engagement`, `pages_messaging`,
   `instagram_basic`, `instagram_manage_comments`, `instagram_manage_messages`.
4. לוודא שחשבון ה-IG הוא Business/Creator ומקושר לדף.
לפרודקשן (דפי לקוחות): App Review להרשאות + Business Verification.

## 8. אבטחה ופרטיות — סיכום
- טוקנים מוצפנים ב-DB; גישת מנהל בלבד; אימות חתימת webhook; עיקרון המינימום בהרשאות.
- שליחה ל-OpenAI רק של הנדרש; כיבוי AI פר-לקוח (`aiEnabled`); מדיניות שמירה תיקבע לפני פרודקשן.
- מידע נכנס = נתון, לא פקודה (prompt-injection).

## 9. אסטרטגיית בדיקות — "אפס תקלות"
- כל שלב: build + lint נקי, ואז בדיקה חיה על דף אפולו בלבד.
- וובהוק: אירועים סינתטיים (חתימה תקינה/שגויה, דדופ, is_echo).
- שליחה (1c): תחילה "dry-run" (מציג מה יישלח בלי לשלוח) → שליחה אמיתית רק אחרי אימות ידני בדף אפולו.
- לא מחברים שום דף לקוח עד שכל 1a–1c הוכחו על דף אפולו.

## 10. פריסה
דף אפולו (dev) → 1a → 1b → 1c מוכחים → App Review + Business Verification → לקוח פיילוט אחד → הרחבה.

## 11. פתוחים
- שם רשומת הלקוח הפנימית לדף אפולו ("אפולו פרסום") — ליצור/לאתר.
- האם IG של אפולו מקושר לדף (תנאי ל-API של IG).
- מדיניות שמירת מידע (retention) — להגדרה לפני פרודקשן.
