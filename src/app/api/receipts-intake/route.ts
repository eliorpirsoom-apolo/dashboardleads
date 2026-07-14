import { NextResponse } from "next/server";
import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import { makeFileKey, presignUpload, r2Configured, writeLocalObject } from "@/lib/storage";
import { rateLimit } from "@/lib/rateLimit";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// ---------------------------------------------------------------------------
// Receipts auto-upload endpoint — used by scripts/receipts-uploader.mjs
// running on the office computer. Auth: RECEIPTS_UPLOAD_TOKEN (server env).
//
// POST multipart-free protocol (JSON + base64 for simplicity at ≤5MB,
// else the script asks for a presigned URL):
//   { clientName, category: "receipt_facebook"|"receipt_google",
//     month: "2026-07", fileName, mimeType, dataBase64? }
// Response includes duplicate detection by (client, category, month, fileName).
// ---------------------------------------------------------------------------

function authorized(req: Request): boolean {
  const token = process.env.RECEIPTS_UPLOAD_TOKEN;
  if (!token) return false;
  const header = req.headers.get("authorization") ?? "";
  const provided = header.replace(/^Bearer\s+/i, "");
  const a = Buffer.from(provided);
  const b = Buffer.from(token);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export async function POST(req: Request) {
  if (!rateLimit("receipts-intake", 120, 60_000)) {
    return NextResponse.json({ error: "יותר מדי בקשות" }, { status: 429 });
  }
  if (!authorized(req)) {
    return NextResponse.json(
      { error: "טוקן קבלות לא מוגדר או שגוי (RECEIPTS_UPLOAD_TOKEN)" },
      { status: 401 }
    );
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON לא תקין" }, { status: 400 });
  }

  const { clientName, category, month, fileName, mimeType, dataBase64 } = body ?? {};
  if (!clientName || !category || !month || !fileName) {
    return NextResponse.json(
      { error: "חסרים שדות: clientName / category / month / fileName" },
      { status: 400 }
    );
  }
  if (!["receipt_facebook", "receipt_google", "invoice"].includes(category)) {
    return NextResponse.json({ error: "קטגוריה לא מוכרת" }, { status: 400 });
  }
  if (!/^\d{4}-\d{2}$/.test(month)) {
    return NextResponse.json({ error: "חודש לא תקין (YYYY-MM)" }, { status: 400 });
  }

  // Client matched by exact name (the folder name on the office computer).
  const client = await prisma.client.findUnique({ where: { name: clientName } });
  if (!client) {
    return NextResponse.json(
      { error: `לקוח "${clientName}" לא נמצא — ודאו ששם התיקייה זהה לשם במערכת` },
      { status: 404 }
    );
  }

  // Duplicate guard: same client+category+month+fileName → skip.
  const existing = await prisma.document.findFirst({
    where: { clientId: client.id, category, month, fileName },
  });
  if (existing) {
    return NextResponse.json({ ok: true, duplicate: true, documentId: existing.id });
  }

  const key = makeFileKey(client.id, category, fileName);
  const mime = mimeType || "application/pdf";

  if (dataBase64) {
    // Direct upload path (small files).
    const buf = Buffer.from(dataBase64, "base64");
    if (buf.length > 10 * 1024 * 1024) {
      return NextResponse.json({ error: "קובץ גדול מדי לנתיב הישיר" }, { status: 413 });
    }
    if (r2Configured()) {
      const { S3Client, PutObjectCommand } = await import("@aws-sdk/client-s3");
      const s3 = new S3Client({
        region: "auto",
        endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
        credentials: {
          accessKeyId: process.env.R2_ACCESS_KEY_ID!,
          secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
        },
      });
      await s3.send(
        new PutObjectCommand({
          Bucket: process.env.R2_BUCKET!,
          Key: key,
          Body: buf,
          ContentType: mime,
        })
      );
    } else {
      await writeLocalObject(key, buf);
    }

    const doc = await prisma.document.create({
      data: {
        clientId: client.id,
        category,
        title: fileName,
        month,
        fileKey: key,
        fileName,
        mimeType: mime,
        size: buf.length,
      },
    });
    return NextResponse.json({ ok: true, documentId: doc.id }, { status: 201 });
  }

  // Large-file path: hand back a presigned PUT; the script uploads then
  // calls again with confirmKey to register.
  if (body.confirmKey) {
    const doc = await prisma.document.create({
      data: {
        clientId: client.id,
        category,
        title: fileName,
        month,
        fileKey: body.confirmKey,
        fileName,
        mimeType: mime,
        size: Number(body.size) || 0,
      },
    });
    return NextResponse.json({ ok: true, documentId: doc.id }, { status: 201 });
  }

  const target = await presignUpload(key, mime);
  return NextResponse.json({ ok: true, presigned: target, key });
}
