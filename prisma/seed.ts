import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { hashPassword } from "../src/lib/auth";

// ---------------------------------------------------------------------------
// Demo seed — an admin, three clients (one per type), users, statuses,
// sources, leads, tasks, a real-estate project and budgets. Idempotent-ish:
// wipes and recreates the demo data.
// ---------------------------------------------------------------------------

const prisma = new PrismaClient();

const DAY = 24 * 60 * 60 * 1000;
const ago = (days: number, hours = 0) =>
  new Date(Date.now() - days * DAY - hours * 60 * 60 * 1000);
const ahead = (days: number, hours = 0) =>
  new Date(Date.now() + days * DAY + hours * 60 * 60 * 1000);

const DEFAULT_STATUSES = [
  { name: "חדש", color: "#38bdf8", order: 0, systemKind: "new", isDefault: true },
  { name: "בטיפול", color: "#f59e0b", order: 1, systemKind: "in_progress", isDefault: false },
  { name: "נקבעה פגישה", color: "#a78bfa", order: 2, systemKind: "in_progress", isDefault: false },
  { name: "עסקה", color: "#34d399", order: 3, systemKind: "won", isDefault: false },
  { name: "אבוד", color: "#f87171", order: 4, systemKind: "lost", isDefault: false },
];

async function createStatuses(clientId: string) {
  const map: Record<string, string> = {};
  for (const s of DEFAULT_STATUSES) {
    const row = await prisma.leadStatus.create({ data: { ...s, clientId } });
    map[s.systemKind + ":" + s.name] = row.id;
    map[s.name] = row.id;
  }
  return map;
}

async function main() {
  console.log("Seeding…");

  // Wipe (dev only!)
  await prisma.$transaction([
    prisma.message.deleteMany(),
    prisma.broadcast.deleteMany(),
    prisma.automation.deleteMany(),
    prisma.reminder.deleteMany(),
    prisma.task.deleteMany(),
    prisma.leadNote.deleteMany(),
    prisma.intakeLog.deleteMany(),
    prisma.inventoryEvent.deleteMany(),
    prisma.priceChange.deleteMany(),
    prisma.contract.deleteMany(),
    prisma.purchaseRequest.deleteMany(),
    prisma.lead.deleteMany(),
    prisma.leadSource.deleteMany(),
    prisma.customFieldDef.deleteMany(),
    prisma.budget.deleteMany(),
    prisma.document.deleteMany(),
    prisma.topAd.deleteMany(),
    prisma.unitType.deleteMany(),
    prisma.project.deleteMany(),
    prisma.campaign.deleteMany(),
    prisma.leadStatus.deleteMany(),
    prisma.seoKeywordRank.deleteMany(),
    prisma.seoKeyword.deleteMany(),
    prisma.seoSnapshot.deleteMany(),
    prisma.integration.deleteMany(),
    prisma.user.deleteMany(),
    prisma.client.deleteMany(),
  ]);

  // --- Agency users -----------------------------------------------------------
  await prisma.user.create({
    data: {
      email: "admin@agency.local",
      name: "מנהל המשרד",
      passwordHash: hashPassword("admin123"),
      role: "ADMIN",
      adminRole: "manager",
    },
  });
  await prisma.user.create({
    data: {
      email: "staff@agency.local",
      name: "עובד המשרד",
      passwordHash: hashPassword("staff123"),
      role: "ADMIN",
      adminRole: "staff",
    },
  });

  // --- Client 1: real estate -------------------------------------------------
  const re = await prisma.client.create({
    data: {
      name: 'נופי השרון נדל"ן',
      type: "realestate",
      company: 'נופי השרון יזמות ובנייה בע"מ',
      contactName: "רונית לוי",
      contactEmail: "ronit@nofey-hasharon.co.il",
      contactPhone: "0521234567",
      color: "#22d3ee",
    },
  });
  const reStatuses = await createStatuses(re.id);

  await prisma.user.create({
    data: {
      email: "client@demo.local",
      name: "רונית לוי",
      passwordHash: hashPassword("client123"),
      role: "CLIENT",
      clientId: re.id,
    },
  });
  await prisma.user.create({
    data: {
      email: "agent@demo.local",
      name: "יוסי כהן",
      passwordHash: hashPassword("agent123"),
      role: "CLIENT",
      isAgent: true,
      clientId: re.id,
      phone: "0537654321",
    },
  });

  const project = await prisma.project.create({
    data: {
      clientId: re.id,
      name: "מגדלי הפארק — הרצליה",
      description: "פרויקט יוקרה: 2 מגדלים, 48 יח\"ד, הרצליה מערב.",
    },
  });

  const gan4 = await prisma.unitType.create({
    data: { projectId: project.id, name: "דירת גן 4 חד׳", rooms: 4, price: 2450000, totalUnits: 2 },
  });
  const reg5 = await prisma.unitType.create({
    data: { projectId: project.id, name: "דירת 5 חד׳", rooms: 5, price: 2890000, totalUnits: 6 },
  });
  await prisma.unitType.create({
    data: { projectId: project.id, name: "פנטהאוז 6 חד׳", rooms: 6, price: 4200000, totalUnits: 1 },
  });

  const reCampaign = await prisma.campaign.create({
    data: {
      clientId: re.id,
      name: "השקה — מגדלי הפארק",
      kind: "leads",
      projectId: project.id,
    },
  });

  const reSource = await prisma.leadSource.create({
    data: {
      clientId: re.id,
      name: "פייסבוק לידים — השקה",
      token: "src_demo_facebook_1",
      channel: "facebook",
      platform: "facebook",
    },
  });
  await prisma.leadSource.create({
    data: {
      clientId: re.id,
      name: "טופס אלמנטור — דף נחיתה",
      token: "src_demo_elementor_1",
      channel: "landing",
      platform: "web",
    },
  });
  await prisma.leadSource.create({
    data: {
      clientId: re.id,
      name: "פייקול — מספר קמפיין",
      token: "src_demo_paycall_1",
      channel: "phone",
      platform: "phone",
      kind: "call",
    },
  });

  await prisma.customFieldDef.create({
    data: { clientId: re.id, key: "rooms_wanted", label: "מס׳ חדרים מבוקש", fieldType: "select", options: JSON.stringify(["3", "4", "5", "פנטהאוז"]), order: 0 },
  });
  await prisma.customFieldDef.create({
    data: { clientId: re.id, key: "financing", label: "זקוק למימון?", fieldType: "boolean", order: 1 },
  });

  const names = [
    "אבי ישראלי", "מיכל רוזן", "דוד פרץ", "נועה שמעוני", "איתי ברק",
    "שרה גולן", "עומר אדלר", "טליה נחום", "גיא שרון", "ליאת אביב",
    "רועי מזרחי", "דנה קפלן", "אלון פישר", "הילה ברנר", "נדב טל",
  ];
  const channels = ["facebook", "facebook", "landing", "google", "facebook"];
  const platforms = ["facebook", "instagram", "web", "web", "facebook"];
  const audiences = ["קהל דומה 1%", "מתעניינים בנדל\"ן", "רימרקטינג 30 יום"];
  const adNames = ["מודעה A — סרטון פרויקט", "מודעה B — הדמיות", "מודעה C — קופי מחיר"];

  let n = 0;
  for (const name of names) {
    n++;
    const kindIdx = n % 5;
    const statusName =
      n <= 2 ? "עסקה" : n <= 5 ? "נקבעה פגישה" : n <= 9 ? "בטיפול" : n <= 13 ? "חדש" : "אבוד";
    const isCall = n % 7 === 0;
    const lead = await prisma.lead.create({
      data: {
        clientId: re.id,
        number: n,
        kind: isCall ? "call" : "form",
        campaignId: reCampaign.id,
        projectId: project.id,
        unitTypeId: n <= 2 ? (n === 1 ? gan4.id : reg5.id) : null,
        statusId: reStatuses[statusName],
        sourceId: reSource.id,
        fullName: name,
        phone: `05${(20000000 + n * 111111).toString().slice(0, 8)}`,
        email: `lead${n}@example.com`,
        city: n % 3 === 0 ? "הרצליה" : n % 3 === 1 ? "רעננה" : "כפר סבא",
        channel: isCall ? "phone" : channels[kindIdx],
        platform: isCall ? "phone" : platforms[kindIdx],
        audience: audiences[n % 3],
        adName: adNames[n % 3],
        campaignLabel: "השקה — מגדלי הפארק",
        consent: n % 4 !== 0,
        callDurationSec: isCall ? 60 + n * 10 : null,
        callStatus: isCall ? "answered" : null,
        receivedAt: ago(Math.floor(n * 1.8), n % 12),
        data: JSON.stringify({
          rooms_wanted: n % 2 === 0 ? "4" : "5",
          financing: n % 3 === 0,
        }),
      },
    });
    if (n <= 5) {
      await prisma.leadNote.create({
        data: {
          leadId: lead.id,
          authorName: "יוסי כהן",
          body: n <= 2 ? "סגרנו! חוזה נחתם במשרד המכירות." : "שיחה ראשונה בוצעה, מתעניין ברצינות.",
          createdAt: ago(Math.floor(n * 1.5)),
        },
      });
    }
  }

  // Sold units reflected in inventory
  await prisma.unitType.update({ where: { id: gan4.id }, data: { soldUnits: 1 } });
  await prisma.unitType.update({ where: { id: reg5.id }, data: { soldUnits: 1 } });
  const wonLeads = await prisma.lead.findMany({
    where: { clientId: re.id, statusId: reStatuses["עסקה"] },
  });
  for (const wl of wonLeads) {
    if (!wl.unitTypeId) continue;
    await prisma.inventoryEvent.create({
      data: { unitTypeId: wl.unitTypeId, delta: -1, reason: "sold", leadId: wl.id, actorName: "יוסי כהן" },
    });
    await prisma.contract.create({
      data: {
        clientId: re.id,
        leadId: wl.id,
        projectId: project.id,
        unitTypeId: wl.unitTypeId,
        value: wl.unitTypeId === gan4.id ? 2450000 : 2890000,
        signedAt: ago(2),
      },
    });
  }

  const monthKey = new Date().toISOString().slice(0, 7);
  await prisma.budget.create({
    data: {
      clientId: re.id,
      projectId: project.id,
      period: "monthly",
      periodKey: monthKey,
      amount: 25000,
      spend: 14300,
    },
  });

  await prisma.topAd.create({
    data: { clientId: re.id, month: monthKey, rank: 1, name: "מודעה A — סרטון פרויקט", platform: "facebook", metric: "23 לידים · 41 ₪ לליד" },
  });
  await prisma.topAd.create({
    data: { clientId: re.id, month: monthKey, rank: 2, name: "מודעה C — קופי מחיר", platform: "instagram", metric: "15 לידים · 52 ₪ לליד" },
  });

  // Tasks & meetings
  const agent = await prisma.user.findUnique({ where: { email: "agent@demo.local" } });
  const ronit = await prisma.user.findUnique({ where: { email: "client@demo.local" } });
  const firstLead = await prisma.lead.findFirst({ where: { clientId: re.id, number: 10 } });

  await prisma.task.create({
    data: {
      clientId: re.id, title: "לחזור לליד — נדב טל", description: "ביקש שיחה אחרי 17:00",
      type: "task", ownerSide: "client", assigneeId: agent?.id, leadId: firstLead?.id,
      dueAt: ahead(0, 3),
      reminders: { create: { channel: "email", remindAt: ahead(0, 2) } },
    },
  });
  await prisma.task.create({
    data: {
      clientId: re.id, title: "פגישת מכירות — משפחת רוזן", type: "meeting",
      ownerSide: "client", assigneeId: ronit?.id, dueAt: ahead(1, 0), durationMin: 60,
      location: "משרד המכירות, הרצליה",
    },
  });
  await prisma.task.create({
    data: {
      clientId: re.id, title: "להעלות קבלות פייסבוק לחודש הנוכחי", type: "task",
      ownerSide: "agency", dueAt: ahead(2, 0),
    },
  });
  await prisma.task.create({
    data: {
      title: "ישיבת צוות שבועית", type: "meeting", ownerSide: "agency",
      dueAt: ahead(0, 5), durationMin: 45, location: "Zoom",
    },
  });

  // --- Client 2: general -------------------------------------------------------
  const gen = await prisma.client.create({
    data: {
      name: "קליניקת ד\"ר ברק",
      type: "general",
      contactName: "ד\"ר ענת ברק",
      contactEmail: "anat@clinic.co.il",
      contactPhone: "0543216789",
      color: "#a78bfa",
    },
  });
  const genStatuses = await createStatuses(gen.id);
  await prisma.user.create({
    data: {
      email: "clinic@demo.local",
      name: "ד\"ר ענת ברק",
      passwordHash: hashPassword("clinic123"),
      role: "CLIENT",
      clientId: gen.id,
    },
  });
  const genCampaign = await prisma.campaign.create({
    data: { clientId: gen.id, name: "לידים — טיפולי אסתטיקה", kind: "leads" },
  });
  await prisma.leadSource.create({
    data: { clientId: gen.id, name: "טופס אתר", token: "src_demo_clinic_1", channel: "landing", platform: "web" },
  });
  for (let i = 1; i <= 6; i++) {
    await prisma.lead.create({
      data: {
        clientId: gen.id, number: i, campaignId: genCampaign.id,
        statusId: genStatuses[i <= 1 ? "עסקה" : i <= 3 ? "בטיפול" : "חדש"],
        fullName: ["גלית מור", "אורי סגל", "יעל בן דוד", "עמית לוי", "שירה כץ", "תום ארד"][i - 1],
        phone: `05${(40000000 + i * 222222).toString().slice(0, 8)}`,
        email: `clinic-lead${i}@example.com`,
        channel: i % 2 ? "facebook" : "google",
        platform: i % 2 ? "instagram" : "web",
        consent: true,
        receivedAt: ago(i * 2),
      },
    });
  }
  await prisma.budget.create({
    data: { clientId: gen.id, campaignId: genCampaign.id, period: "monthly", periodKey: monthKey, amount: 8000, spend: 5200 },
  });

  // --- Client 3: SEO -------------------------------------------------------------
  const seo = await prisma.client.create({
    data: {
      name: "סטודיו פיט",
      type: "seo",
      contactName: "מאיה פיטוסי",
      contactEmail: "maya@studiofit.co.il",
      color: "#34d399",
    },
  });
  const seoStatuses = await createStatuses(seo.id);
  await prisma.user.create({
    data: {
      email: "seo@demo.local",
      name: "מאיה פיטוסי",
      passwordHash: hashPassword("seo123"),
      role: "CLIENT",
      clientId: seo.id,
    },
  });
  await prisma.leadSource.create({
    data: { clientId: seo.id, name: "טופס יצירת קשר — אתר", token: "src_demo_seo_1", channel: "organic", platform: "web" },
  });
  for (let i = 1; i <= 4; i++) {
    await prisma.lead.create({
      data: {
        clientId: seo.id, number: i,
        statusId: seoStatuses[i === 1 ? "עסקה" : "חדש"],
        fullName: ["רון אשכנזי", "לירון חן", "אביב שגב", "מור דהן"][i - 1],
        phone: `05${(80000000 + i * 333333).toString().slice(0, 8)}`,
        channel: "organic", platform: "web", consent: i % 2 === 0,
        receivedAt: ago(i * 3),
      },
    });
  }
  // SEO snapshots — 30 days of demo data
  for (let d = 0; d < 30; d++) {
    const date = new Date(Date.now() - d * DAY).toISOString().slice(0, 10);
    const wave = Math.sin(d / 5) * 10;
    await prisma.seoSnapshot.create({
      data: {
        clientId: seo.id, date, source: "search_console",
        clicks: Math.max(5, Math.round(40 - d * 0.5 + wave)),
        impressions: Math.max(100, Math.round(1200 - d * 12 + wave * 20)),
        position: Math.max(3, 8 - d * 0.1),
      },
    });
    await prisma.seoSnapshot.create({
      data: {
        clientId: seo.id, date, source: "ga4",
        sessions: Math.max(20, Math.round(150 - d * 1.5 + wave * 2)),
        users: Math.max(15, Math.round(120 - d * 1.2 + wave * 2)),
        conversions: Math.max(0, Math.round(4 - d * 0.05)),
      },
    });
  }
  for (const kw of ["חדר כושר תל אביב", "אימון אישי", "סטודיו פילאטיס"]) {
    const k = await prisma.seoKeyword.create({ data: { clientId: seo.id, keyword: kw } });
    for (let d = 0; d < 30; d += 3) {
      await prisma.seoKeywordRank.create({
        data: {
          keywordId: k.id,
          date: new Date(Date.now() - d * DAY).toISOString().slice(0, 10),
          position: Math.max(1, 12 - (30 - d) * 0.25 + Math.random() * 2),
        },
      });
    }
  }

  console.log("Seed done.");
  console.log("Users: admin@agency.local/admin123 · client@demo.local/client123 · agent@demo.local/agent123 · clinic@demo.local/clinic123 · seo@demo.local/seo123");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
