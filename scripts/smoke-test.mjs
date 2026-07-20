// ============================================================================
// Smoke tests — the critical business flows, end to end, against a running
// dev server with seeded data:
//
//   1. npm run db:dev && npm run db:seed
//   2. npm run dev            (or: npx next dev -p 3000)
//   3. node scripts/smoke-test.mjs [baseUrl]
//
// Covers: auth, cross-client scoping, intake + dedupe, inventory automation
// (won → sold → revert), oversell guard, broadcast consent enforcement,
// reminders cron. Exits non-zero on any failure.
// ============================================================================

const BASE = process.argv[2] || "http://localhost:3000";
let failures = 0;
let passes = 0;

function ok(name, cond, extra = "") {
  if (cond) {
    passes++;
    console.log(`  ✓ ${name}`);
  } else {
    failures++;
    console.error(`  ✗ ${name} ${extra}`);
  }
}

class Session {
  constructor() {
    this.cookie = "";
  }
  async login(email, password) {
    const res = await fetch(`${BASE}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    const setCookie = res.headers.get("set-cookie") ?? "";
    this.cookie = setCookie.split(";")[0];
    return res;
  }
  async api(path, init = {}) {
    const res = await fetch(`${BASE}${path}`, {
      ...init,
      headers: {
        Cookie: this.cookie,
        ...(init.body ? { "Content-Type": "application/json" } : {}),
        ...init.headers,
      },
    });
    let data = null;
    try {
      data = await res.json();
    } catch {}
    return { res, data };
  }
}

console.log(`Smoke tests → ${BASE}\n`);

// --- 1. Auth ---------------------------------------------------------------
console.log("1. אימות");
const admin = new Session();
const adminLogin = await admin.login("admin@agency.local", "admin123");
ok("admin login", adminLogin.ok);

const client = new Session();
ok("client login", (await client.login("client@demo.local", "client123")).ok);

const bad = new Session();
const badLogin = await bad.login("admin@agency.local", "wrong-password");
ok("wrong password rejected", badLogin.status === 401);

// --- 2. Scoping --------------------------------------------------------------
console.log("2. סקופינג");
const { data: clientsData } = await admin.api("/api/clients");
const clinic = clientsData.clients.find((c) => c.name.includes("קליניקת"));
const nofey = clientsData.clients.find((c) => c.name.includes("נופי"));

const cross = await client.api(`/api/leads?clientId=${clinic.id}`);
ok("client blocked from other client's leads", cross.res.status === 403);

const adminRoute = await client.api("/api/clients");
ok("client blocked from admin routes", adminRoute.res.status === 403);

const noClient = await admin.api("/api/leads");
ok("admin must specify clientId", noClient.res.status === 400);

// --- 3. Intake + dedupe --------------------------------------------------------
console.log("3. קליטה ישירה");
const stamp = Date.now().toString().slice(-7);
const phone = `050${stamp}`;
const intake1 = await fetch(`${BASE}/api/intake/src_demo_elementor_1`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ name: "בדיקת עשן", phone, consent: "true" }),
});
const lead1 = await intake1.json();
ok("intake creates lead", intake1.ok && lead1.leadId, JSON.stringify(lead1));

const intake2 = await fetch(`${BASE}/api/intake/src_demo_elementor_1`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ name: "כפול", phone: `+972${phone.slice(1)}` }),
});
const dup = await intake2.json();
ok("dedupe by normalized phone", dup.duplicate === true && dup.leadId === lead1.leadId);

const badToken = await fetch(`${BASE}/api/intake/src_nope`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ name: "x", phone: "0500000000" }),
});
ok("unknown token rejected", badToken.status === 404);

// --- 4. Inventory automation ----------------------------------------------------
console.log("4. אוטומציית מלאי");
const { data: projects } = await client.api("/api/projects");
const proj = projects.projects[0];
const { data: projFull } = await client.api(`/api/projects/${proj.id}`);
const unit = projFull.project.unitTypes.find((u) => u.totalUnits - u.soldUnits > 0);
const { data: statuses } = await client.api("/api/statuses");
const won = statuses.statuses.find((s) => s.systemKind === "won");
const fresh = statuses.statuses.find((s) => s.systemKind === "new");

await client.api(`/api/leads/${lead1.leadId}`, {
  method: "PATCH",
  body: JSON.stringify({ unitTypeId: unit.id }),
});
const before = unit.soldUnits;
await client.api(`/api/leads/${lead1.leadId}`, {
  method: "PATCH",
  body: JSON.stringify({ statusId: won.id }),
});
let { data: after } = await client.api(`/api/projects/${proj.id}`);
let unitAfter = after.project.unitTypes.find((u) => u.id === unit.id);
ok("won status decrements inventory", unitAfter.soldUnits === before + 1);

await client.api(`/api/leads/${lead1.leadId}`, {
  method: "PATCH",
  body: JSON.stringify({ statusId: fresh.id }),
});
({ data: after } = await client.api(`/api/projects/${proj.id}`));
unitAfter = after.project.unitTypes.find((u) => u.id === unit.id);
ok("revert restores inventory", unitAfter.soldUnits === before);

// --- 5. Broadcast consent ---------------------------------------------------------
console.log("5. תפוצה והסכמה לדיוור");
const { data: allLeads } = await client.api("/api/leads?consent=true&pageSize=100");
const expectedTargets = allLeads.rows.filter((r) => r.email).length;
const { res: bRes, data: bData } = await client.api("/api/broadcasts", {
  method: "POST",
  body: JSON.stringify({
    name: `smoke-${stamp}`,
    channel: "email",
    body: "שלום {{name}}",
  }),
});
ok(
  "broadcast targets exactly consenting leads",
  bRes.ok && bData.broadcast.total === expectedTargets,
  `total=${bData?.broadcast?.total} expected=${expectedTargets}`
);

// --- 6. Reminders cron ----------------------------------------------------------
console.log("6. תזכורות");
const cronRes = await fetch(`${BASE}/api/cron/reminders`, {
  headers: { Authorization: "Bearer dev-cron-secret" },
});
ok("reminders cron runs", cronRes.ok);

// --- 7. Roles & permissions (logic-closure round 1) -------------------------------
console.log("7. תפקידים והרשאות");
const staff = new Session();
ok("staff login", (await staff.login("staff@agency.local", "staff123")).ok);
ok(
  "staff blocked from admin-users",
  (await staff.api("/api/admin-users", { method: "POST", body: JSON.stringify({ email: "x@x.co", name: "x", password: "123456" }) })).res.status === 403
);
ok(
  "staff blocked from client create",
  (await staff.api("/api/clients", { method: "POST", body: JSON.stringify({ name: "smoke-x" }) })).res.status === 403
);

const agent = new Session();
ok("agent login", (await agent.login("agent@demo.local", "agent123")).ok);
ok(
  "agent blocked from status create",
  (await agent.api("/api/statuses", { method: "POST", body: JSON.stringify({ name: "x", color: "#ff0000", systemKind: "new" }) })).res.status === 403
);
ok(
  "agent blocked from broadcasts",
  (await agent.api("/api/broadcasts")).res.status === 403
);

// --- 8. Lead CRM (round 2): assignee, activity, bulk, archive ---------------------
console.log("8. מטפל, ציר פעילות ופעולות מרובות");
const { data: cu } = await client.api("/api/client-users");
const agentId = cu.users.find((u) => u.isAgent)?.id;
const { data: leadPage } = await client.api("/api/leads?pageSize=100");
const workLead = leadPage.rows.find((r) => r.number === 4);
await client.api(`/api/leads/${workLead.id}`, {
  method: "PATCH",
  body: JSON.stringify({ assigneeId: agentId }),
});
const { data: afterAssign } = await client.api(`/api/leads/${workLead.id}`);
ok("assignee set + activity recorded",
  afterAssign.lead.assigneeId === agentId &&
  afterAssign.lead.activities.some((a) => a.kind === "assign"));

const { data: mine } = await agent.api("/api/leads?assigneeId=me");
ok("agent sees lead in 'my leads'", mine.rows.some((r) => r.id === workLead.id));

const bulkTargets = leadPage.rows.filter((r) => [5, 6].includes(r.number)).map((r) => r.id);
const { res: bulkRes } = await client.api("/api/leads/bulk", {
  method: "POST",
  body: JSON.stringify({ ids: bulkTargets, action: "archive" }),
});
const { data: archived } = await client.api("/api/leads?archived=true&pageSize=100");
ok("bulk archive", bulkRes.ok && bulkTargets.every((id) => archived.rows.some((r) => r.id === id)));
await client.api("/api/leads/bulk", {
  method: "POST",
  body: JSON.stringify({ ids: bulkTargets, action: "restore" }),
});
const { data: restored } = await client.api("/api/leads?pageSize=100");
ok("bulk restore", bulkTargets.every((id) => restored.rows.some((r) => r.id === id)));

// --- 9. Unsubscribe (round 3) — token computed with the dev AUTH_SECRET -----------
console.log("9. הסרה מדיוור");
const { readFileSync } = await import("node:fs");
const crypto = await import("node:crypto");
const envText = readFileSync(new URL("../.env", import.meta.url), "utf8");
const secret = envText.match(/AUTH_SECRET="?([^"\r\n]+)"?/)?.[1] ?? "";
const consentLead = restored.rows.find((r) => r.consent);
if (consentLead && secret) {
  const sig = crypto.createHmac("sha256", secret).update(`unsub.${consentLead.id}`).digest("hex").slice(0, 32);
  const token = Buffer.from(`${consentLead.id}.${sig}`).toString("base64url");
  const unsubRes = await fetch(`${BASE}/api/unsubscribe`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ t: token }),
  });
  const { data: afterUnsub } = await client.api(`/api/leads/${consentLead.id}`);
  ok("unsubscribe flips consent", unsubRes.ok && afterUnsub.lead.consent === false);
} else {
  ok("unsubscribe flips consent", false, "(no consenting lead or secret)");
}
const badUnsub = await fetch(`${BASE}/api/unsubscribe`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ t: "garbage" }),
});
ok("bad unsubscribe token rejected", badUnsub.status === 400);

// --- 10. Search & audit (round 4) --------------------------------------------------
console.log("10. חיפוש ויומן פעולות");
const { data: search } = await admin.api(`/api/search?q=${encodeURIComponent("נופי")}`);
ok("global search finds client", search.clients.length > 0);
ok("audit visible to manager", (await admin.api("/api/audit")).res.ok);
ok("audit blocked for staff", (await staff.api("/api/audit")).res.status === 403);

// --- 11. Projects layer (round 6): source→project, agent scoping ------------------
console.log("11. שכבת פרויקטים");
{
  // Admin creates: project, agent, project-source; assigns the agent as primary.
  const projName = `smoke-proj-${stamp}`;
  const { data: projRes } = await admin.api("/api/projects", {
    method: "POST",
    body: JSON.stringify({ clientId: nofey.id, name: projName }),
  });
  const projId = projRes.project.id;

  const agentEmail = `smoke-agent-${stamp}@test.local`;
  const { data: agentRes } = await admin.api(`/api/clients/${nofey.id}/users`, {
    method: "POST",
    body: JSON.stringify({ email: agentEmail, name: `סוכן עשן ${stamp}`, password: "smoke123", isAgent: true }),
  });
  const { res: assignRes } = await admin.api(`/api/projects/${projId}/agents`, {
    method: "POST",
    body: JSON.stringify({ userId: agentRes.user.id, isPrimary: true }),
  });
  ok("agent assigned to project", assignRes.ok);

  const { data: srcRes } = await admin.api("/api/sources", {
    method: "POST",
    body: JSON.stringify({ clientId: nofey.id, name: `מקור עשן ${stamp}`, kind: "form", projectId: projId }),
  });

  const projIntake = await fetch(`${BASE}/api/intake/${srcRes.source.token}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: "ליד פרויקט", phone: `052${stamp}` }),
  });
  const projLead = await projIntake.json();
  const { data: projLeadFull } = await admin.api(`/api/leads/${projLead.leadId}`);
  ok(
    "intake routes lead to project + primary agent",
    projLeadFull.lead.projectId === projId && projLeadFull.lead.assigneeId === agentRes.user.id
  );

  const projAgent = new Session();
  ok("project agent login", (await projAgent.login(agentEmail, "smoke123")).ok);
  const { data: agentLeads } = await projAgent.api("/api/leads?pageSize=100");
  ok(
    "project agent sees ONLY project leads",
    agentLeads.rows.length >= 1 && agentLeads.rows.every((r) => r.id === projLead.leadId)
  );
  const { res: crossLead } = await projAgent.api(`/api/leads/${lead1.leadId}`);
  ok("project agent blocked from other leads", crossLead.status === 403);
  const { data: agentProjects } = await projAgent.api("/api/projects");
  ok(
    "project agent sees only own projects",
    agentProjects.projects.length === 1 && agentProjects.projects[0].id === projId
  );

  // Cleanup: keep dev DB tidy-ish (archive the lead, deactivate source+agent).
  await admin.api("/api/leads/bulk", {
    method: "POST",
    body: JSON.stringify({ clientId: nofey.id, ids: [projLead.leadId], action: "archive" }),
  });
  await admin.api(`/api/sources/${srcRes.source.id}`, { method: "PATCH", body: JSON.stringify({ active: false }) });
}

// --- Summary --------------------------------------------------------------------
console.log(`\n${passes} עברו, ${failures} נכשלו`);
process.exit(failures > 0 ? 1 : 0);
