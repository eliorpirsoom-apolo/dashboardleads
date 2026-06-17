import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import { promises as fs } from "fs";
import path from "path";
import { saveSession, sessionStateOption, clearSession } from "./session";
import { generateMockLeads } from "./mock";
import type { ScrapedLead, ScrapeResult } from "./types";

// ---------------------------------------------------------------------------
// Lead Manager (ליד מנג'ר) scraper
//
// Since the CRM does not expose an API, we drive a real browser with Playwright
// to log in and read the leads table. Selectors and column positions are driven
// by environment variables (see .env.example) so the scraper can be adapted to
// the live DOM without code changes.
//
// Robustness features:
//   - Session reuse (cookies) so we only log in when needed.
//   - Automatic re-login if the cached session has expired.
//   - Configurable selectors + retry on transient failures.
//   - Graceful fallback to mock data when credentials are absent, so the
//     dashboard remains demonstrable.
// ---------------------------------------------------------------------------

interface ScraperConfig {
  baseUrl: string;
  loginUrl: string;
  leadsUrl: string;
  username: string;
  password: string;
  headless: boolean;
  selectors: {
    username: string;
    password: string;
    loginButton: string;
    loginSuccess: string;
    leadsRow: string;
  };
  columns: {
    leadId: number;
    campaign: number;
    datetime: number;
    status: number;
    source: number;
  };
}

function loadConfig(): ScraperConfig {
  return {
    baseUrl: process.env.LEAD_MANAGER_BASE_URL ?? "",
    loginUrl: process.env.LEAD_MANAGER_LOGIN_URL ?? "",
    leadsUrl: process.env.LEAD_MANAGER_LEADS_URL ?? "",
    username: process.env.LEAD_MANAGER_USERNAME ?? "",
    password: process.env.LEAD_MANAGER_PASSWORD ?? "",
    headless: process.env.HEADLESS !== "false",
    selectors: {
      // `strEnv` falls back on empty strings too (CI passes "" for unset vars).
      username: strEnv(
        "SELECTOR_USERNAME",
        "input[name='username'], input[type='email']"
      ),
      password: strEnv(
        "SELECTOR_PASSWORD",
        "input[name='password'], input[type='password']"
      ),
      loginButton: strEnv("SELECTOR_LOGIN_BUTTON", "button[type='submit']"),
      loginSuccess: strEnv("SELECTOR_LOGIN_SUCCESS", "nav"),
      leadsRow: strEnv("SELECTOR_LEADS_TABLE", "table tbody tr"),
    },
    columns: {
      leadId: intEnv("COL_LEAD_ID", 0),
      campaign: intEnv("COL_CAMPAIGN", 1),
      datetime: intEnv("COL_DATETIME", 2),
      status: intEnv("COL_STATUS", 3),
      source: intEnv("COL_SOURCE", 4),
    },
  };
}

// Read a string env var, falling back when it's missing OR empty (CI sets
// unset workflow vars to an empty string, which `??` would not catch).
function strEnv(name: string, fallback: string): string {
  const v = process.env[name];
  return v === undefined || v.trim() === "" ? fallback : v;
}

function intEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === "") return fallback;
  const v = Number(raw);
  return Number.isInteger(v) ? v : fallback;
}

/** Are the minimum credentials present to attempt a live scrape? */
function hasCredentials(cfg: ScraperConfig): boolean {
  return Boolean(
    cfg.loginUrl &&
      cfg.leadsUrl &&
      cfg.username &&
      cfg.password &&
      !cfg.username.includes("your-username")
  );
}

// ---------------------------------------------------------------------------
// Date parsing
// ---------------------------------------------------------------------------

/**
 * Parse the various date formats Lead Manager might render. Handles:
 *   - ISO 8601 (2026-06-14T10:30:00Z)
 *   - dd/MM/yyyy HH:mm  (common Israeli format)
 *   - dd.MM.yyyy HH:mm
 * Falls back to `now` if the value can't be parsed.
 */
export function parseDateTime(raw: string, now = new Date()): Date {
  const text = (raw ?? "").trim();
  if (!text) return now;

  // Try native parsing first (covers ISO).
  const native = new Date(text);
  if (!Number.isNaN(native.getTime()) && /\d{4}-\d{2}-\d{2}/.test(text)) {
    return native;
  }

  // dd/MM/yyyy or dd.MM.yyyy with optional HH:mm(:ss)
  const m = text.match(
    /(\d{1,2})[./](\d{1,2})[./](\d{2,4})(?:[ ,]+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/
  );
  if (m) {
    const [, dd, mm, yyyyRaw, hh, min, ss] = m;
    const yyyy = yyyyRaw.length === 2 ? 2000 + Number(yyyyRaw) : Number(yyyyRaw);
    const date = new Date(
      yyyy,
      Number(mm) - 1,
      Number(dd),
      Number(hh ?? 0),
      Number(min ?? 0),
      Number(ss ?? 0)
    );
    if (!Number.isNaN(date.getTime())) return date;
  }

  return Number.isNaN(native.getTime()) ? now : native;
}

// ---------------------------------------------------------------------------
// Login
// ---------------------------------------------------------------------------

async function isLoggedIn(page: Page, cfg: ScraperConfig): Promise<boolean> {
  // Consider the session valid if a "logged-in" marker is visible and we are
  // not sitting on the login form.
  const loginVisible = await page
    .locator(cfg.selectors.password)
    .first()
    .isVisible()
    .catch(() => false);
  if (loginVisible) return false;

  const successVisible = await page
    .locator(cfg.selectors.loginSuccess)
    .first()
    .isVisible()
    .catch(() => false);
  return successVisible;
}

async function login(page: Page, cfg: ScraperConfig): Promise<void> {
  console.log("[scraper] Logging in to Lead Manager…");
  await page.goto(cfg.loginUrl, { waitUntil: "domcontentloaded" });

  // Capture the login form so its real field selectors can be verified.
  if (debugEnabled()) await dumpDiagnostics(page, "login-page", []);

  await page.locator(cfg.selectors.username).first().fill(cfg.username);
  await page.locator(cfg.selectors.password).first().fill(cfg.password);

  await Promise.all([
    page.waitForLoadState("networkidle").catch(() => {}),
    page.locator(cfg.selectors.loginButton).first().click(),
  ]);

  // Wait for the post-login marker.
  await page
    .locator(cfg.selectors.loginSuccess)
    .first()
    .waitFor({ state: "visible", timeout: 15000 });

  console.log("[scraper] Login successful.");
}

// ---------------------------------------------------------------------------
// Extraction
// ---------------------------------------------------------------------------

async function extractLeads(page: Page, cfg: ScraperConfig): Promise<ScrapedLead[]> {
  await page.goto(cfg.leadsUrl, { waitUntil: "domcontentloaded" });
  await page
    .locator(cfg.selectors.leadsRow)
    .first()
    .waitFor({ state: "visible", timeout: 15000 })
    .catch(() => {
      console.warn("[scraper] No lead rows became visible — page may be empty.");
    });

  // Pull the text of every cell of every row in one DOM pass.
  const rows: string[][] = await page.$$eval(cfg.selectors.leadsRow, (trs) =>
    trs.map((tr) =>
      Array.from(tr.querySelectorAll("td, th")).map((cell) =>
        (cell.textContent ?? "").replace(/\s+/g, " ").trim()
      )
    )
  );

  const { columns } = cfg;
  const leads: ScrapedLead[] = [];

  for (const cells of rows) {
    if (cells.length === 0) continue;
    const externalId = cells[columns.leadId];
    if (!externalId) continue; // skip header / malformed rows

    leads.push({
      externalId,
      campaignName: cells[columns.campaign] || "Unknown Campaign",
      receivedAt: parseDateTime(cells[columns.datetime] ?? ""),
      status: cells[columns.status] || "New",
      source: cells[columns.source] || "Unknown",
    });
  }

  console.log(`[scraper] Extracted ${leads.length} lead row(s).`);
  return leads;
}

// ---------------------------------------------------------------------------
// Orchestration
// ---------------------------------------------------------------------------

async function withRetry<T>(
  fn: () => Promise<T>,
  attempts = 2,
  label = "operation"
): Promise<T> {
  let lastErr: unknown;
  for (let i = 1; i <= attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      console.warn(`[scraper] ${label} failed (attempt ${i}/${attempts}):`, err);
    }
  }
  throw lastErr;
}

// ---------------------------------------------------------------------------
// Diagnostics
//
// On the first runs we don't know Lead Manager's real DOM. These helpers dump a
// screenshot, the page HTML, a summary of any <table>/grid structures, and any
// JSON API responses seen — uploaded as CI artifacts so the scraper can be
// tuned precisely without direct access to the site. Disable with
// SCRAPER_DEBUG=false once selectors are dialled in.
// ---------------------------------------------------------------------------

interface JsonHit {
  url: string;
  status: number;
  sample: string;
}

function debugEnabled(): boolean {
  return process.env.SCRAPER_DEBUG !== "false";
}

async function dumpDiagnostics(page: Page, label: string, jsonHits: JsonHit[]) {
  try {
    const dir = path.resolve("debug");
    await fs.mkdir(dir, { recursive: true });

    await page
      .screenshot({ path: path.join(dir, `${label}.png`), fullPage: true })
      .catch(() => {});

    const html = await page.content().catch(() => "");
    await fs.writeFile(path.join(dir, `${label}.html`), html, "utf8");

    // Summarise candidate data structures (tables + ARIA grids) AND the
    // interactive fields (inputs/buttons). This is also printed to the console
    // so it can be read from CI logs without downloading the artifact.
    const summary = await page
      .evaluate(() => {
        const tables = Array.from(document.querySelectorAll("table")).map((t, i) => {
          const rows = Array.from(t.querySelectorAll("tr"));
          const cellsOf = (r: Element | undefined) =>
            r ? Array.from(r.querySelectorAll("th,td")).map((c) => (c.textContent || "").trim()) : [];
          return {
            index: i,
            rowCount: rows.length,
            headerCells: cellsOf(rows[0]),
            sampleRow: cellsOf(rows[1]),
          };
        });
        // All form fields/buttons with the attributes we need for selectors.
        const fields = Array.from(
          document.querySelectorAll("input, select, textarea, button, [role='button'], a.btn")
        )
          .slice(0, 60)
          .map((el) => ({
            tag: el.tagName.toLowerCase(),
            type: el.getAttribute("type"),
            name: el.getAttribute("name"),
            id: el.id || null,
            placeholder: el.getAttribute("placeholder"),
            autocomplete: el.getAttribute("autocomplete"),
            text: (el.textContent || "").replace(/\s+/g, " ").trim().slice(0, 40) || null,
          }));
        const forms = Array.from(document.querySelectorAll("form")).map((f) => ({
          action: f.getAttribute("action"),
          method: f.getAttribute("method"),
          id: f.id || null,
        }));
        const iframes = Array.from(document.querySelectorAll("iframe")).map((f) =>
          f.getAttribute("src")
        );
        return {
          url: location.href,
          title: document.title,
          forms,
          fields,
          iframes,
          tables,
          ariaGrids: document.querySelectorAll('[role="grid"],[role="table"]').length,
          ariaRows: document.querySelectorAll('[role="row"]').length,
        };
      })
      .catch(() => null);

    await fs.writeFile(
      path.join(dir, `${label}.summary.json`),
      JSON.stringify({ summary, jsonEndpoints: jsonHits }, null, 2),
      "utf8"
    );
    // Print to the log (readable via the Actions API) — bounded in size.
    console.log(`[diag:${label}] ` + JSON.stringify({ summary, jsonEndpoints: jsonHits.map((j) => ({ url: j.url, status: j.status })) }).slice(0, 5000));
    console.log(
      `[scraper] Diagnostics written to debug/${label}.{png,html,summary.json}`
    );
  } catch (err) {
    console.warn("[scraper] Failed to write diagnostics:", err);
  }
}

/**
 * Scrape leads from Lead Manager. Returns mock data (live:false) when
 * credentials are not configured so the dashboard always has something to show.
 */
export async function scrapeLeads(): Promise<ScrapeResult> {
  const cfg = loadConfig();

  if (!hasCredentials(cfg)) {
    console.warn(
      "[scraper] Lead Manager credentials not configured — returning mock data. " +
        "Set LEAD_MANAGER_* vars in .env to enable live scraping."
    );
    return { leads: generateMockLeads(), live: false };
  }

  let browser: Browser | undefined;
  let context: BrowserContext | undefined;

  try {
    browser = await chromium.launch({ headless: cfg.headless });

    // Reuse a cached session if we have one.
    const storageState = await sessionStateOption();
    context = await browser.newContext({
      storageState,
      locale: "he-IL",
    });
    const page = await context.newPage();

    // Record JSON responses — reveals an internal API we could target instead
    // of scraping the DOM (far more reliable). Captured into diagnostics.
    const jsonHits: JsonHit[] = [];
    if (debugEnabled()) {
      page.on("response", async (res) => {
        try {
          const ct = res.headers()["content-type"] ?? "";
          if (!ct.includes("application/json")) return;
          const body = await res.text().catch(() => "");
          if (body.length < 40) return; // skip tiny/ack responses
          jsonHits.push({ url: res.url(), status: res.status(), sample: body.slice(0, 800) });
        } catch {
          /* ignore */
        }
      });
    }

    // Verify the session by visiting the leads page; log in if needed.
    // The whole flow is wrapped so diagnostics are captured even if login fails.
    let leads: ScrapedLead[] = [];
    try {
      await page.goto(cfg.leadsUrl, { waitUntil: "domcontentloaded" });
      if (!(await isLoggedIn(page, cfg))) {
        if (storageState) {
          console.log("[scraper] Cached session expired — re-authenticating.");
          await clearSession();
        }
        await withRetry(() => login(page, cfg), 2, "login");
        await saveSession(context);
      } else {
        console.log("[scraper] Reusing cached session.");
      }
      leads = await withRetry(() => extractLeads(page, cfg), 2, "extract");
    } finally {
      // Always capture diagnostics during setup so selectors can be tuned —
      // including the case where login itself failed.
      if (debugEnabled()) await dumpDiagnostics(page, "leads-page", jsonHits);
    }
    return { leads, live: true };
  } finally {
    await context?.close().catch(() => {});
    await browser?.close().catch(() => {});
  }
}
