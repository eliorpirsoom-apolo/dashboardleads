import { NextResponse } from "next/server";
import { z } from "zod";
import JSZip from "jszip";
import { prisma } from "@/lib/prisma";
import { handle, requireUser, readJson, ApiError } from "@/lib/api";
import { getObject } from "@/lib/storage";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const Body = z.object({ ids: z.array(z.string().min(1)).min(1).max(100) });

// POST /api/design-assets/zip — הורדת תוצרים מסומנים כקובץ ZIP אחד.
// משרד, או הלקוח של המשימה (כל הקבצים חייבים להשתייך ללקוח שלו).
export const POST = handle(async (req) => {
  const user = await requireUser();
  const b = Body.parse(await readJson(req));

  const assets = await prisma.designAsset.findMany({
    where: { id: { in: b.ids } },
    include: { designTask: { select: { clientId: true } } },
  });
  if (assets.length === 0) throw new ApiError(404, "לא נמצאו תוצרים");
  if (user.role !== "ADMIN" && assets.some((a) => a.designTask.clientId !== user.clientId)) {
    throw new ApiError(403, "אין הרשאה");
  }

  const zip = new JSZip();
  const usedNames = new Set<string>();
  let added = 0;
  for (const a of assets) {
    if (!a.fileKey) continue;
    try {
      const bytes = await getObject(a.fileKey);
      // שמות כפולים בזיפ — מוסיפים מונה לפני הסיומת.
      let name = a.fileName || `file-${added + 1}`;
      if (usedNames.has(name)) {
        const dot = name.lastIndexOf(".");
        const base = dot > 0 ? name.slice(0, dot) : name;
        const ext = dot > 0 ? name.slice(dot) : "";
        let i = 2;
        while (usedNames.has(`${base} (${i})${ext}`)) i++;
        name = `${base} (${i})${ext}`;
      }
      usedNames.add(name);
      zip.file(name, bytes);
      added++;
    } catch (e) {
      console.error("[assets-zip]", a.id, e);
    }
  }
  if (added === 0) throw new ApiError(502, "לא הצלחנו לקרוא אף קובץ מהאחסון");

  const buf = await zip.generateAsync({ type: "nodebuffer", compression: "STORE" });
  return new NextResponse(new Uint8Array(buf), {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent("designs.zip")}`,
      "Cache-Control": "no-store",
    },
  });
});
