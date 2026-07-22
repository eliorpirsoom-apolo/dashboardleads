import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// נקודת תחזוקה חד-פעמית: מגדירה מדיניות CORS על דלי ה-R2 כדי לאפשר
// העלאות ישירות מהדפדפן (presigned PUT). מוסרת מהקוד אחרי ההרצה.
export async function POST(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { S3Client, PutBucketCorsCommand, GetBucketCorsCommand } = await import(
    "@aws-sdk/client-s3"
  );
  const client = new S3Client({
    region: "auto",
    endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID!,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
    },
  });

  await client.send(
    new PutBucketCorsCommand({
      Bucket: process.env.R2_BUCKET!,
      CORSConfiguration: {
        CORSRules: [
          {
            AllowedOrigins: [
              "https://dashboard-leads-apollo13.vercel.app",
              "http://localhost:3000",
            ],
            AllowedMethods: ["PUT", "GET"],
            AllowedHeaders: ["*"],
            MaxAgeSeconds: 3600,
          },
        ],
      },
    })
  );

  const current = await client.send(
    new GetBucketCorsCommand({ Bucket: process.env.R2_BUCKET! })
  );
  return NextResponse.json({ ok: true, rules: current.CORSRules });
}
