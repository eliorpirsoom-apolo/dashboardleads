# 🔌 מדריך החיבורים — כל מה שנשאר לחבר

> המערכת בנויה ומוכנה. כל סעיף כאן הוא חיבור חיצוני שרק בעל החשבונות יכול לבצע.
> הסדר חשוב: סעיפים 1–3 חובה להפעלה. השאר — לפי הצורך, כל אחד בנפרד.
>
> בכל מקום שכתוב "משתנה סביבה" — מגדירים ב-Vercel:
> **Project → Settings → Environment Variables** (ואז Redeploy).

---

## 1) העלאה ל-Vercel + בסיס נתונים (חובה)

> ✅ **בוצע ב-13.07.2026** — המערכת חיה: **https://dashboard-leads-apollo13.vercel.app**
> (פרויקט `dashboard-leads` תחת צוות APOLLO): מחובר לריפו, בסיס נתונים Neon Postgres
> (`DATABASE_URL` + `DATABASE_URL_UNPOOLED` הוזרקו אוטומטית), הסודות
> `AUTH_SECRET` / `CRON_SECRET` / `RECEIPTS_UPLOAD_TOKEN` הוגדרו, המיגרציות רצו,
> ו-Vercel Authentication כובה (למערכת אימות משלה).
>
> ✅ פריסה אוטומטית פעילה (13.07): כל push לענף הפרודקשן נפרס לבד.
> חשבון המנהל הראשון נוצר ב-/setup (העמוד נעול מעתה).
>
> ✅ תזכורות בזמן אמת (19.07.2026): job בשם "CRM Reminders" ב-cron-job.org
> (חשבון Google של המשרד) קורא ל-`/api/cron/reminders` כל 5 דקות עם
> Header:‏ `Authorization: Bearer <CRON_SECRET>`. ה-cron היומי של Vercel (05:00)
> נשאר כגיבוי. אם מחליפים את CRON_SECRET ב-Vercel — לעדכן גם את ה-Header ב-job.
>
> ההוראות המקוריות נשמרות כאן למקרה של הקמה מחדש:

1. נכנסים ל-[vercel.com](https://vercel.com) → **Add New → Project** → מייבאים את ריפו הגיט.
2. **Storage → Create Database → Neon Postgres** — משתני החיבור מוזרקים אוטומטית.
3. מוסיפים ב-Environment Variables:
   - `AUTH_SECRET` ⟵ מחרוזת אקראית ארוכה:
     `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
   - `CRON_SECRET` ⟵ עוד מחרוזת אקראית (אותה פקודה).
4. **Deploy**. הבילד מריץ אוטומטית את המיגרציות (סקריפט `vercel-build`).
5. נכנסים ל-`https://<הדומיין>/setup` — יצירת חשבון מנהל המשרד הראשון. ✅

> מרגע שקיים משתמש אחד, עמוד ה-setup ננעל לצמיתות.

## 2) אחסון קבצים — Cloudflare R2 (חובה למסמכים) ✅ בוצע 13.07.2026

> הופעל בחשבון `Eliorbucris@gmail.com`: bucket‏ `crm-files`, טוקן עם הרשאת
> Object Read & Write מוגבל ל-bucket הזה. 4 המשתנים (`R2_ACCOUNT_ID`,
> `R2_BUCKET`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`) הוגדרו ב-Vercel
> (Production + Preview) ונבדקו מקצה לקצה (PUT/GET/DELETE). העלאת מסמכים חיה.
>
> ההוראות המקוריות נשמרות למקרה של הקמה מחדש:

1. ב-[Cloudflare Dashboard](https://dash.cloudflare.com) → **R2 Object Storage** → **Create bucket** (שם: `crm-files`).
2. **Manage R2 API Tokens → Create API Token** → הרשאת **Object Read & Write** על ה-bucket.
3. משתני סביבה ב-Vercel:
   - `R2_ACCOUNT_ID` — מזהה החשבון (מופיע בעמוד ה-R2)
   - `R2_ACCESS_KEY_ID` + `R2_SECRET_ACCESS_KEY` — מהטוקן שנוצר
   - `R2_BUCKET` — שם ה-bucket
4. Redeploy. מעכשיו כל קובץ (הסכמים, קבלות, תוכניות דירה) נשמר ב-R2 עם גישה חתומה בלבד.

## 3) מייל — SMTP (חובה לתזכורות במייל) ✅ בוצע 16.07.2026

> מחובר דרך Gmail Workspace‏ (`marketing@apolloadv.co.il`) עם סיסמת אפליקציה.
> נבדק בשליחה אמיתית. תזכורות, אוטומציות ותפוצה נשלחות מהכתובת הזו.
> לביטול הגישה: מוחקים את סיסמת האפליקציה "CRM" ב-myaccount.google.com/apppasswords.
> מגבלת Gmail: ~2,000 מיילים/יום — מספיק בגדול; אם תפוצות יגדלו, שדרוג טבעי הוא Brevo/SendGrid.
>
> ההוראות המקוריות להקמה מחדש:

כל ספק SMTP עובד (Gmail Workspace / Zoho / SendGrid / Brevo). משתני סביבה:

- `SMTP_HOST`, `SMTP_PORT` (בד"כ 465), `SMTP_SECURE` (true),
  `SMTP_USER`, `SMTP_PASSWORD`
- `EMAIL_FROM` — למשל: `המשרד <no-reply@your-domain.co.il>`

> בלי SMTP המערכת עדיין עובדת — הודעות מייל נרשמות ביומן כ"ממתינה לחיבור ספק".

## 4) כניסה עם Google (מומלץ) — ✅ בוצע (19.07.2026)

הוגדר ואומת מקצה לקצה:

- פרויקט Google Cloud: **Apollo CRM** (`apollo-crm-502908`, תחת eliorbucris@gmail.com).
- מסך הסכמה: שם "Apollo CRM", קהל External, סטטוס **In production** (כל חשבון Google).
  מייל תמיכה: eliorbucris@gmail.com (Google מגביל לחשבון המחובר בלבד); מייל עדכונים: marketing@apolloadv.co.il.
- OAuth Client‏ "Apollo CRM Web" עם 4 redirect URIs (פרודקשן + localhost, כניסה + SEO).
- `GOOGLE_CLIENT_ID` + `GOOGLE_CLIENT_SECRET` הוגדרו ב-Vercel (Production + Preview) ונפרסו.
- אומת: כפתור Google מופיע במסך הכניסה, והזרימה מגיעה למסך בחירת חשבון של Google ללא שגיאות.

> משתמש מתחבר עם Google רק אם הוזמן קודם במערכת (לפי אותו אימייל). אין הרשמה עצמית.
> כלומר: כדי להיכנס עם Google, האימייל של המשתמש במערכת חייב להיות זהה לאימייל חשבון ה-Google.

הוראות ההקמה המקוריות (לשחזור/דומיין חדש): קונסולה → פרויקט → OAuth consent (External) →
Client ID (Web) עם `/api/auth/google/callback` + `/api/integrations/google/callback` →
משתני סביבה → Redeploy. בהחלפת דומיין: להוסיף את ה-URIs החדשים ב-Client הקיים.

## 5) קליטת לידים — Make / Zapier / אלמנטור (לב המערכת)

לכל מקור יוצרים "מקור קליטה" במערכת: **לקוח → הגדרות → מקורות קליטה → יצירת מקור**,
ומעתיקים את הכתובת (למשל `https://<הדומיין>/api/intake/src_xxx`).

**טופס אלמנטור (ישיר, בלי Make):**
Elementor Pro → בטופס → **Actions After Submit → Webhook** → מדביקים את הכתובת. זהו.

**פייסבוק לידים דרך Make:**
1. תרחיש חדש: **Facebook Lead Ads → Watch Leads** (מחברים את חשבון הפייסבוק).
2. מוסיפים מודול **HTTP → Make a request**: POST לכתובת המקור, Body type: JSON.
3. ממפים שדות: `name`, `phone`, `email`, `campaign`, `adset` ⟵ `audience`, `ad`.
   (המערכת מזהה גם שמות עבריים: שם, טלפון, מייל.)

**פייקול (לידים טלפוניים) דרך Make/Zapier:**
תרחיש על "שיחה חדשה" בפייקול ⟵ HTTP POST למקור מסוג **שיחות**, עם:
`caller` (מספר), `duration` (שניות), `recording_url`, `call_status`.
שיחה ממספר מוכר מזוהה אוטומטית כליד קיים (דה-דופ 24 שעות).

בדיקת חיבור: פתיחת כתובת המקור בדפדפן (GET) מחזירה אישור חיבור.

## 6) SEO — Search Console + Analytics (ללקוחות SEO)

דרישה מוקדמת: סעיף 4 בוצע, ובנוסף ב-Google Cloud:
**APIs & Services → Library** → מפעילים **Search Console API** + **Google Analytics Data API**.

לכל לקוח SEO:
1. נכנסים ללקוח → טאב **SEO** → לוחצים **חיבור** ליד Search Console — נכנסים עם חשבון
   הגוגל שיש לו גישה לאתר הלקוח, מאשרים. חוזרים ועושים אותו דבר ל-Analytics.
2. בלקוח → **הגדרות → אינטגרציות הלקוח**: מזינים את כתובת האתר כפי שהיא מופיעה
   ב-Search Console (או `sc-domain:example.co.il`) ואת ה-Property ID של GA4 (מספר).
3. הסנכרון רץ אוטומטית כל לילה ב-04:00. לבדיקה מיידית אפשר להריץ פעם אחת ידנית:
   `https://<הדומיין>/api/cron/seo-sync` עם Header:‏ `Authorization: Bearer <CRON_SECRET>`.

## 7) Meta — וואטסאפים + 2 המודעות החזקות (אוטומטי)

1. [developers.facebook.com](https://developers.facebook.com) → App עסקי → מוסיפים **Marketing API**.
2. ב-Business Settings יוצרים **System User** עם הרשאת `ads_read` לחשבון המודעות, ומפיקים לו טוקן קבוע.
3. במערכת: לקוח → **הגדרות → אינטגרציות הלקוח → Meta**: מזינים `act_XXXX` (מזהה חשבון המודעות) + הטוקן → שמירה → **סנכרון עכשיו**.
4. מעכשיו דוח הלקוח כולל כמות שיחות וואטסאפ מקמפיינים, ו-2 המודעות החזקות מתעדכנות אוטומטית מדי סנכרון.

## 8) SMS ווואטסאפ יוצאים (תזכורות, אוטומציות, תפוצה)

**SMS — ספק עם HTTP API (למשל 019):** משתני סביבה:
- `SMS_API_URL` — כתובת ה-API של הספק
- `SMS_API_TOKEN` — הטוקן
- `SMS_FROM` — שם השולח

**וואטסאפ — WhatsApp Business Cloud API (Meta):**
- `WHATSAPP_API_TOKEN` — טוקן קבוע (System User עם הרשאת whatsapp)
- `WHATSAPP_PHONE_ID` — מזהה מספר הטלפון העסקי

> עד לחיבור: הודעות SMS/וואטסאפ נרשמות ביומן ההודעות כ"ממתינה לחיבור ספק" —
> שום דבר לא הולך לאיבוד, והכול נשלח רגיל אחרי החיבור.

## 9) קבלות אוטומטיות (מחשב המשרד)

1. ב-Vercel מוסיפים משתנה `RECEIPTS_UPLOAD_TOKEN` (מחרוזת אקראית — אותה פקודת node מסעיף 1).
2. במחשב המשרד יוצרים תיקייה `C:\Receipts` במבנה:
   ```
   C:\Receipts\
     נופי השרון נדל"ן\        ← שם הלקוח בדיוק כמו במערכת
       2026-07\
         facebook\ קבלה.pdf   ← קבלות פייסבוק
         google\   קבלה.pdf   ← קבלות גוגל
         חשבונית.pdf          ← ישירות בתיקייה = חשבונית
   ```
3. מעתיקים למחשב המשרד את הקבצים `scripts/receipts-uploader.mjs` + קובץ `.env` עם:
   `CRM_BASE_URL`, `RECEIPTS_UPLOAD_TOKEN`, `RECEIPTS_DIR` (ומתקינים Node אם אין).
4. הרצה: `node receipts-uploader.mjs` (או `--watch` לריצה רציפה).
   מומלץ: Windows Task Scheduler ⟵ הרצה יומית. כפילויות מדולגות אוטומטית.

## 10) ייבוא הלידים מהמערכת הישנה (חד-פעמי)

הדאטה מ"ליד מנג'ר" שמור בקובץ `prisma/legacy-leadmanager.db`. אחרי שהלקוח הרלוונטי קיים:

```
npm run import:legacy -- "שם הלקוח בדיוק כמו במערכת"
```

בטוח להרצה חוזרת (לידים קיימים מדולגים).

---

## צ'ק-ליסט מסכם

| # | חיבור | סטטוס עד אז |
|---|---|---|
| 1 | Vercel + Postgres + סודות | ✅ מחובר |
| 2 | R2 | ✅ מחובר |
| 3 | SMTP | ✅ מחובר |
| 4 | Google Login | ✅ מחובר (19.07.2026) |
| 5 | Make/Zapier/אלמנטור | קליטה ידנית בלבד |
| 6 | Search Console/GA4 | דשבורד SEO ריק |
| 7 | Meta | וואטסאפים ומודעות — ידני |
| 8 | SMS/וואטסאפ | תזכורות במייל בלבד |
| 9 | טוקן קבלות | העלאת קבלות ידנית |
| 10 | ייבוא ישן | היסטוריה לא מופיעה |

**בדיקת תקינות אחרי חיבור:** צד משרד → הגדרות → "חיבורים גלובליים" — הכול צריך להיות ירוק.
