# Campaign & Lead Management Dashboard

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/eliorpirsoom-apolo/dashboardleads&env=TURSO_DATABASE_URL,TURSO_AUTH_TOKEN&envDescription=Turso%20libSQL%20connection%20for%20the%20lead%20cache&project-name=lead-dashboard&repository-name=lead-dashboard)

A full-stack dashboard for **Lead Manager (ליד מנג'ר)**. Because the CRM has no
API, data is extracted via **Playwright** browser automation, cached in a local
**SQLite** database (via **Prisma**), and served through a modern **Next.js +
Tremor** dashboard with KPIs, trends, period-over-period comparisons, and
week-over-week regression alerting (in-app + email).

---

## ✨ Features

| Area | What you get |
| --- | --- |
| **Scraper** | Playwright login with **session/cookie reuse**, configurable selectors, retry logic, incremental upserts. Extracts Lead ID, Campaign, Date/Time, Status, Source. |
| **Date filtering** | Presets — Yesterday, Last 7 Days, Current Month, Previous Month, Last Year — plus a custom range picker. |
| **Campaign granularity** | A campaign dropdown filters every KPI, chart, and table. Defaults to *All Campaigns*. |
| **Monitoring & alerts** | Week-over-week regression detection. Configurable drop threshold (default 20%). Prominent red glowing UI badge + automated **Nodemailer** email on sync. |
| **Period-over-period** | Every KPI shows `% change vs the previous period`, recomputed for whatever range is selected. |
| **SEO PDF report** | One-command Hebrew (RTL) organic-search report pulled from **Google Search Console** (clicks, impressions, CTR, position, top queries & pages, movers), rendered to **PDF** via Playwright and emailed to the client. Falls back to mock data when GSC isn't configured. |

---

## 🏗 Tech Stack

- **Next.js 14** (App Router) + **TypeScript**
- **Tailwind CSS** + **Tremor** (charts, KPI cards, tables)
- **Playwright** (headless/headed scraping)
- **Prisma** + **SQLite** locally / **Turso (libSQL)** in production — one code path via the libSQL driver adapter
- **Nodemailer** (email alerts)
- **date-fns** (date math)

---

## 🚀 Quick Start

```bash
# 1. Install dependencies
npm install

# 2. Install the Playwright browser (only needed for live scraping)
npx playwright install chromium

# 3. Configure environment
cp .env.example .env        # then edit credentials/SMTP as needed

# 4. Create the database
npm run db:push

# 5. Seed demo data (so the dashboard works without live credentials)
npm run db:seed

# 6. Run the dashboard
npm run dev                 # http://localhost:3000
```

> The seed generates ~60 days of realistic leads across 5 campaigns, **including a
> deliberate week-over-week drop** on one campaign so you can immediately see the
> regression alert (red glow + banner) in action.

---

## ☁️ Deploy to Vercel + Turso

The dashboard runs great on **Vercel**. Because Vercel's filesystem is
ephemeral and read-only, the local SQLite file is swapped for a hosted
**Turso** database (libSQL — SQLite-compatible, so the same `provider = sqlite`
and the same code path are used everywhere).

> **Note:** the Playwright scraper **cannot** run on Vercel/Cloudflare
> serverless functions. Deploy the dashboard to Vercel and run the scraper
> separately (a cron job, a small VM, or a scheduled GitHub Action) writing to
> the same Turso DB. To just see the dashboard live, seed demo data (below).

### 1. Create the Turso database

```bash
# Install the Turso CLI: https://docs.turso.tech/cli/installation
turso db create lead-dashboard

# Apply the schema (generated DDL is committed at prisma/schema.sql)
turso db shell lead-dashboard < prisma/schema.sql

# Grab the connection details
turso db show lead-dashboard --url        # -> TURSO_DATABASE_URL (libsql://…)
turso db tokens create lead-dashboard     # -> TURSO_AUTH_TOKEN
```

### 2. Seed demo data into Turso (optional, for a live demo)

Two options — **no local setup required for the second one:**

```bash
# Option A: seed from your machine
TURSO_DATABASE_URL="libsql://…" TURSO_AUTH_TOKEN="…" npm run db:seed
```

**Option B (easiest):** after deploying, just open the live site and click
**“Sync now”**. With no Lead Manager credentials configured, the sync writes
realistic demo data (including the built-in regression) straight into Turso.

### 3. Deploy on Vercel

1. Push this repo to GitHub and **Import Project** in Vercel.
2. Add Environment Variables: `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN`
   (and `ALERT_*` / `SMTP_*` / `EMAIL_ENABLED` if you want email alerts).
3. Deploy. Vercel runs `npm run build` (which runs `prisma generate`) and
   serves the app. Done — your dashboard is live. 🎉

`vercel.json` pins the framework and build command; no extra config needed.

---

## 🔄 Syncing real data

Configure the `LEAD_MANAGER_*` variables in `.env`, then:

```bash
npm run scrape           # headless sync
npm run scrape:headed    # visible browser — useful for tuning selectors
```

Or trigger a sync from the UI ("Sync now") or via the API:

```bash
curl -X POST http://localhost:3000/api/sync
```

**Cron example** (every 30 minutes):

```cron
*/30 * * * * cd /path/to/dashboardleads && npm run scrape >> sync.log 2>&1
```

### Adapting the scraper to the live site

The Lead Manager DOM is unknown ahead of time, so all selectors and table
column positions are **driven by environment variables** (`SELECTOR_*`,
`COL_*`) — no code changes needed. Run `npm run scrape:headed`, inspect the
page, and adjust the values in `.env`. The first successful login is cached to
`SESSION_STORAGE_PATH` so subsequent syncs skip the login step (and auto
re-login if the session expires).

If credentials are absent, the scraper **falls back to mock data** so the app
stays demonstrable.

---

## 🧱 Project Structure

```
prisma/
  schema.prisma        # Campaign, Lead, SyncLog models
  seed.ts              # demo data seeder
scripts/
  sync.ts              # cron-friendly sync entrypoint
src/
  app/
    page.tsx, layout.tsx
    api/
      stats/           # KPIs, trend, breakdowns, regressions
      campaigns/       # dropdown options
      leads/           # paginated/filterable table data
      sync/            # POST: run sync · GET: sync history
      alerts/          # GET: regressions · POST: send test email
  components/          # DashboardClient + DateRangePicker, KpiCards,
                       # AlertBanner, charts, LeadsTable, ...
  lib/
    prisma.ts          # Prisma singleton
    dates.ts           # presets + period-over-period logic
    stats.ts           # aggregation + regression detection
    sync.ts            # scrape → persist → detect → alert pipeline
    email.ts           # Nodemailer alerts
    query.ts, format.ts, types.ts
  scraper/
    leadManager.ts     # Playwright scraper
    session.ts         # cookie/session persistence
    mock.ts            # fallback/demo data generator
```

---

## ⚙️ Key Configuration (`.env`)

| Variable | Purpose |
| --- | --- |
| `LEAD_MANAGER_*` | Login/leads URLs and credentials |
| `SELECTOR_*`, `COL_*` | DOM selectors + table column indexes |
| `HEADLESS` | `true` (default) or `false` to watch the browser |
| `SESSION_STORAGE_PATH` | Where the authenticated session is cached |
| `ALERT_DROP_THRESHOLD_PERCENT` | Regression threshold (default `20`) |
| `EMAIL_ENABLED` + `SMTP_*` | Nodemailer email alert settings |

---

## 📡 API Reference

All filter-aware endpoints accept: `?preset=last7&campaign=<id|all>` plus
`&from=YYYY-MM-DD&to=YYYY-MM-DD` when `preset=custom`.

| Method | Route | Description |
| --- | --- | --- |
| `GET` | `/api/stats` | KPIs (with comparisons), trend, breakdowns, regressions |
| `GET` | `/api/campaigns` | Campaign list + lead counts |
| `GET` | `/api/leads` | Paginated, searchable leads (`page`, `pageSize`, `q`) |
| `POST` | `/api/sync` | Run a full scrape + persist + alert pass |
| `GET` | `/api/sync` | Recent sync history |
| `GET` | `/api/alerts` | Week-over-week regression results |
| `POST` | `/api/alerts` | Send a test regression email |
| `GET` | `/api/reports/seo` | Generate + download the organic-search PDF report |
| `POST` | `/api/reports/seo` | Generate + email the report (`to_email`, `preset`, `client`) |

---

## 🔔 How alerting works

On every sync, `detectRegressions()` compares each campaign's **trailing 7 days**
against the **prior 7 days**. A campaign is flagged when it had a meaningful
baseline (≥3 leads) and dropped by ≥ the configured threshold. Flagged campaigns
trigger:

1. A pulsing **red glow + badge** on the affected KPI card and a banner in the UI.
2. An **email** to `ALERT_EMAIL_TO` (when `EMAIL_ENABLED=true`).

---

## 📈 Google organic (SEO) report

Generate a polished, client-ready **Hebrew PDF** of organic-search performance
straight from **Google Search Console**.

```bash
npm run report:seo                         # PDF -> ./reports (previous month)
npm run report:seo -- --send               # also email it (needs EMAIL_ENABLED)
npm run report:seo -- --preset currentMonth
npm run report:seo -- --client "אינסטלציה כהן" --to client@example.com
```

Or via the API (Node runtime — Playwright renders the PDF):

```bash
# Download the PDF
curl -L "http://localhost:3000/api/reports/seo?preset=previousMonth" -o report.pdf

# Generate + email it
curl -X POST http://localhost:3000/api/reports/seo \
  -H 'Content-Type: application/json' \
  -d '{"preset":"previousMonth","client":"אינסטלציה כהן","to_email":"client@example.com"}'
```

**What's in the report:** executive summary (auto-generated), headline KPIs with
period-over-period change (clicks, impressions, CTR, average position), top
search queries, ranking movers (up/down), top landing pages, and an editable
"what we did / next month" section.

### Connecting Search Console

The report works immediately with **mock data**. To pull real numbers:

1. In **Google Cloud**, enable the *Google Search Console API*, create a
   **service account**, and download its JSON key.
2. In **Search Console** → *Settings → Users and permissions*, add the service
   account email (`…@….iam.gserviceaccount.com`) as a user on the property.
3. Set the env vars:

| Variable | Purpose |
| --- | --- |
| `SC_SITE_URL` | Exact property string — `sc-domain:example.co.il` (domain) or `https://example.co.il/` (URL-prefix) |
| `GOOGLE_SC_CREDENTIALS_JSON` | Service-account key as inline JSON, **or** … |
| `GOOGLE_SC_CREDENTIALS_PATH` | … a path to the downloaded key file |
| `SEO_CLIENT_NAME` | Default client name on the report |
| `SEO_REPORT_EMAIL_TO` | Default recipient when emailing |

4. **Verify the connection** — one command confirms the credentials work and
   prints the exact property strings you can use for `SC_SITE_URL`:

   ```bash
   npm run report:seo:check
   ```

   It reports the service-account email (add this as a user in Search Console
   if you haven't), lists every property the account can read, and tells you
   whether your `SC_SITE_URL` is among them. Once it shows ✅, run
   `npm run report:seo` for real data.

> **PDF rendering** reuses the project's Playwright Chromium (`npx playwright
> install chromium`). In containerized/serverless environments where Chromium
> lives at a custom path, set `PLAYWRIGHT_CHROMIUM_EXECUTABLE`.

> **Cron** (1st of every month, 08:00):
> ```cron
> 0 8 1 * * cd /path/to/dashboardleads && npm run report:seo -- --send >> report.log 2>&1
> ```
