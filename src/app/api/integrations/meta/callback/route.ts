import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import {
  exchangeCodeForUserToken,
  listUserPages,
  signUserToken,
  unpackMetaState,
} from "@/lib/integrations/metaLeads";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// GET /api/integrations/meta/callback — חזרה מדיאלוג Meta: מחליפים קוד בטוקן,
// שולפים את העמודים שהמשתמש מנהל ומציגים מסך בחירה (העמוד ← הפרויקט).
export async function GET(req: Request) {
  const user = await getSession();
  if (!user || user.role !== "ADMIN") {
    return NextResponse.redirect(new URL("/login", req.url));
  }
  const sp = new URL(req.url).searchParams;
  const code = sp.get("code");
  const state = unpackMetaState(sp.get("state") ?? "");
  if (!code || !state) {
    return NextResponse.redirect(new URL("/admin?meta_error=state", req.url));
  }
  const project = await prisma.project.findUnique({
    where: { id: state.projectId },
    select: { id: true, name: true, clientId: true },
  });
  if (!project || project.clientId !== state.clientId) {
    return NextResponse.redirect(new URL("/admin?meta_error=project", req.url));
  }

  try {
    const userToken = await exchangeCodeForUserToken(code);
    const pages = await listUserPages(userToken);
    const connected = await prisma.metaPage.findMany({
      where: { pageId: { in: pages.map((p) => p.id) } },
      select: { pageId: true },
    });
    const connectedIds = new Set(connected.map((c) => c.pageId));
    const blob = signUserToken(userToken);

    const rows = pages
      .map((p) => {
        const taken = connectedIds.has(p.id);
        return `<label class="row${taken ? " taken" : ""}">
          <input type="radio" name="pageId" value="${esc(p.id)}" data-name="${esc(p.name)}" ${taken ? "disabled" : ""} required>
          <span>${esc(p.name)}</span>
          ${taken ? '<em>כבר מחובר</em>' : ""}
        </label>`;
      })
      .join("\n");

    const html = `<!doctype html>
<html dir="rtl" lang="he"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>בחירת עמוד פייסבוק</title>
<style>
  body{font-family:system-ui,-apple-system,"Segoe UI",Arial;background:#f6f7fb;color:#1e293b;margin:0;padding:24px}
  .card{max-width:560px;margin:0 auto;background:#fff;border:1px solid #e2e8f0;border-radius:16px;padding:24px}
  h1{font-size:18px;margin:0 0 4px}
  p{font-size:13px;color:#64748b;margin:0 0 16px}
  .row{display:flex;align-items:center;gap:10px;padding:10px 12px;border:1px solid #e2e8f0;border-radius:12px;margin-bottom:8px;cursor:pointer;font-size:14px}
  .row:hover{background:#f8fafc}
  .row.taken{opacity:.5;cursor:default}
  .row em{margin-inline-start:auto;font-size:11px;color:#94a3b8;font-style:normal}
  button{background:#3a5bd9;color:#fff;border:0;border-radius:12px;padding:10px 20px;font-size:14px;font-weight:600;cursor:pointer;margin-top:8px}
  button:hover{background:#2f4bc0}
  .empty{padding:16px;text-align:center;color:#94a3b8;font-size:13px}
</style></head><body>
<div class="card">
  <h1>חיבור עמוד פייסבוק — ${esc(project.name)}</h1>
  <p>בחרו את העמוד שהלידים שלו ייכנסו לפרויקט הזה. מרגע החיבור כל ליד חדש מטפסי הפייסבוק של העמוד ייקלט אוטומטית תוך שניות.</p>
  <form method="POST" action="/api/integrations/meta/attach" onsubmit="var c=document.querySelector('input[name=pageId]:checked'); if(c) document.getElementById('pn').value=c.dataset.name;">
    ${rows || '<div class="empty">לא נמצאו עמודים שאתם מנהלים בחשבון הזה.</div>'}
    <input type="hidden" name="projectId" value="${esc(project.id)}">
    <input type="hidden" name="clientId" value="${esc(project.clientId)}">
    <input type="hidden" name="blob" value="${esc(blob)}">
    <input type="hidden" name="pageName" id="pn" value="">
    ${pages.length ? '<button type="submit">חיבור העמוד הנבחר ←</button>' : ""}
  </form>
</div>
</body></html>`;
    return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8" } });
  } catch (err) {
    console.error("[meta callback]", err);
    return NextResponse.redirect(new URL(`/admin?meta_error=oauth`, req.url));
  }
}
