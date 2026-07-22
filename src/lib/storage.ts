import crypto from "crypto";
import fs from "fs/promises";
import path from "path";

// ---------------------------------------------------------------------------
// File storage — S3-compatible driver (Cloudflare R2) in production, local
// disk in development. Selected by env: when R2_* vars are present we talk
// to R2; otherwise files land in .uploads/ (gitignored).
//
// Uploads go DIRECTLY to storage (presigned PUT) so Vercel's 4.5MB request
// limit never constrains file size; the local driver accepts a plain PUT to
// an API route instead. Downloads always flow through /api/files/[id] which
// enforces session + client scoping before handing out the bytes.
// ---------------------------------------------------------------------------

const SECRET =
  process.env.AUTH_SECRET || "dev-insecure-secret-change-me-in-production";

export function r2Configured(): boolean {
  return Boolean(
    process.env.R2_ACCOUNT_ID &&
      process.env.R2_ACCESS_KEY_ID &&
      process.env.R2_SECRET_ACCESS_KEY &&
      process.env.R2_BUCKET
  );
}

function localDir(): string {
  return path.join(process.cwd(), process.env.STORAGE_DIR || ".uploads");
}

// Lazily create the S3 client only when R2 is configured.
async function s3() {
  const { S3Client } = await import("@aws-sdk/client-s3");
  return new S3Client({
    region: "auto",
    endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID!,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
    },
  });
}

/** Storage keys: clients/<clientId>/<category>/<random>-<safe-name> */
export function makeFileKey(
  clientId: string,
  category: string,
  fileName: string
): string {
  const safe = fileName.replace(/[^\w.\-֐-׿]+/g, "_").slice(-80);
  const rand = crypto.randomBytes(8).toString("hex");
  return `clients/${clientId}/${category}/${rand}-${safe}`;
}

// --- Presigned upload -------------------------------------------------------

export interface UploadTarget {
  method: "PUT";
  url: string;
  headers: Record<string, string>;
  key: string;
}

/**
 * Where should the browser PUT the file bytes?
 * R2: a presigned URL straight to the bucket. Local: our own API route.
 */
export async function presignUpload(
  key: string,
  mimeType: string
): Promise<UploadTarget> {
  if (r2Configured()) {
    const { PutObjectCommand } = await import("@aws-sdk/client-s3");
    const { getSignedUrl } = await import("@aws-sdk/s3-request-presigner");
    const url = await getSignedUrl(
      await s3(),
      new PutObjectCommand({
        Bucket: process.env.R2_BUCKET!,
        Key: key,
        ContentType: mimeType,
      }),
      { expiresIn: 600 }
    );
    return { method: "PUT", url, headers: { "Content-Type": mimeType }, key };
  }

  // Local: PUT to our API with an HMAC token proving the key was authorized.
  const exp = Date.now() + 10 * 60 * 1000;
  const sig = signLocal(`${key}.${exp}`);
  return {
    method: "PUT",
    url: `/api/uploads/local?key=${encodeURIComponent(key)}&exp=${exp}&sig=${sig}`,
    headers: { "Content-Type": mimeType || "application/octet-stream" },
    key,
  };
}

function signLocal(value: string): string {
  return crypto.createHmac("sha256", SECRET).update(value).digest("hex");
}

export function verifyLocalUploadToken(
  key: string,
  exp: string,
  sig: string
): boolean {
  if (Number(exp) < Date.now()) return false;
  const expected = signLocal(`${key}.${exp}`);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// --- Server-side write ------------------------------------------------------

/**
 * Write bytes to storage from the server (R2 putObject / local disk).
 * Used by the same-origin upload proxy so the browser never talks to R2
 * directly — no bucket CORS needed. Fine for the file sizes we handle
 * (quotes, contracts, receipts); large media would want presigned PUT.
 */
export async function putObject(
  key: string,
  data: Buffer,
  mimeType: string
): Promise<void> {
  if (r2Configured()) {
    const { PutObjectCommand } = await import("@aws-sdk/client-s3");
    await (await s3()).send(
      new PutObjectCommand({
        Bucket: process.env.R2_BUCKET!,
        Key: key,
        Body: data,
        ContentType: mimeType,
      })
    );
    return;
  }
  await writeLocalObject(key, data);
}

// --- Local writes / reads ---------------------------------------------------

export async function writeLocalObject(
  key: string,
  data: Buffer
): Promise<void> {
  const file = path.join(localDir(), key);
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, data);
}

export async function readLocalObject(key: string): Promise<Buffer> {
  return fs.readFile(path.join(localDir(), key));
}

// --- Download ----------------------------------------------------------------

/**
 * A short-lived URL the browser can fetch the file from.
 * R2: presigned GET. Local: null — the API route streams the bytes itself.
 */
export async function presignDownload(
  key: string,
  fileName: string
): Promise<string | null> {
  if (!r2Configured()) return null;
  const { GetObjectCommand } = await import("@aws-sdk/client-s3");
  const { getSignedUrl } = await import("@aws-sdk/s3-request-presigner");
  return getSignedUrl(
    await s3(),
    new GetObjectCommand({
      Bucket: process.env.R2_BUCKET!,
      Key: key,
      ResponseContentDisposition: `inline; filename*=UTF-8''${encodeURIComponent(fileName)}`,
    }),
    { expiresIn: 600 }
  );
}

// --- Delete -------------------------------------------------------------------

export async function deleteObject(key: string): Promise<void> {
  if (r2Configured()) {
    const { DeleteObjectCommand } = await import("@aws-sdk/client-s3");
    await (await s3()).send(
      new DeleteObjectCommand({ Bucket: process.env.R2_BUCKET!, Key: key })
    );
    return;
  }
  await fs.unlink(path.join(localDir(), key)).catch(() => {});
}
