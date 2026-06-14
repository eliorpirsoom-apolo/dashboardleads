import { subDays } from "date-fns";
import type { ScrapedLead } from "./types";

// ---------------------------------------------------------------------------
// Mock data generator
//
// Used as a fallback when Lead Manager credentials are not configured, and by
// the seed script, so the dashboard is fully functional out-of-the-box and the
// regression/alerting logic can be demonstrated.
// ---------------------------------------------------------------------------

const CAMPAIGNS = [
  "Google Search - Brand",
  "Facebook Lead Ads",
  "Instagram Stories",
  "Taboola Native",
  "Email Newsletter",
];

const SOURCES = ["Google", "Facebook", "Instagram", "Taboola", "Organic", "Email"];
const STATUSES = ["New", "Contacted", "Qualified", "Converted", "Lost", "No Answer"];

// Deterministic-ish pseudo-random generator so seeded data is reproducible.
function makeRng(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s / 0x7fffffff;
  };
}

/**
 * Generate `days` worth of leads. To exercise the regression detector, one
 * campaign ("Taboola Native") deliberately drops sharply in the most recent
 * week relative to the prior week.
 */
export function generateMockLeads(days = 60, seed = 42): ScrapedLead[] {
  const rng = makeRng(seed);
  const leads: ScrapedLead[] = [];
  let counter = 1;
  const now = new Date();

  for (let d = days - 1; d >= 0; d--) {
    const day = subDays(now, d);

    for (const campaign of CAMPAIGNS) {
      // Base daily volume per campaign.
      let base = 4 + Math.floor(rng() * 6);

      // Simulate a steep recent drop for one campaign (regression demo):
      // last 7 days get a fraction of the usual volume.
      if (campaign === "Taboola Native" && d < 7) {
        base = Math.max(0, Math.floor(base * 0.25));
      }

      const count = Math.max(0, base + Math.floor(rng() * 3) - 1);
      for (let i = 0; i < count; i++) {
        const hour = Math.floor(rng() * 14) + 7; // 07:00–21:00
        const minute = Math.floor(rng() * 60);
        const receivedAt = new Date(day);
        receivedAt.setHours(hour, minute, 0, 0);

        leads.push({
          externalId: `MOCK-${counter++}`,
          campaignName: campaign,
          receivedAt,
          status: STATUSES[Math.floor(rng() * STATUSES.length)],
          source: SOURCES[Math.floor(rng() * SOURCES.length)],
        });
      }
    }
  }

  return leads;
}
