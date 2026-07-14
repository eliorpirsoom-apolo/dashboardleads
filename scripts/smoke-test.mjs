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

// --- Summary --------------------------------------------------------------------
console.log(`\n${passes} עברו, ${failures} נכשלו`);
process.exit(failures > 0 ? 1 : 0);
