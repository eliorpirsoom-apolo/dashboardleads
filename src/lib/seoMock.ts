import {
  differenceInCalendarDays,
  eachDayOfInterval,
  format,
} from "date-fns";
import type { DailyMetric, QueryMetric } from "./google";

// Total span the demo trend grows across (current 60 days + previous 60 days).
const TREND_SPAN_DAYS = 120;

// ---------------------------------------------------------------------------
// Deterministic demo data for the SEO report, used when a client has no live
// Google credentials/properties configured. Generated from a string seed so the
// same client always renders the same (plausible, gently-improving) numbers.
// ---------------------------------------------------------------------------

function hashSeed(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

// Small seeded PRNG (mulberry32).
function rng(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// 0 for the oldest day in the 120-day span, 1 for the most recent (refEnd).
// Anchoring growth to absolute time (not the per-call window) makes the current
// 60 days clearly outperform the previous 60 days.
function progressOf(d: Date, refEnd: Date): number {
  const daysAgo = differenceInCalendarDays(refEnd, d);
  const p = 1 - daysAgo / TREND_SPAN_DAYS;
  return Math.min(1, Math.max(0, p));
}

// Daily GSC metrics across [from, to]. `refEnd` is the most-recent day of the
// report (the current period's end) so the upward trend in clicks/impressions
// and the improvement (decrease) in average position span both periods.
export function mockSearchConsoleDaily(
  seed: string,
  from: Date,
  to: Date,
  refEnd: Date
): DailyMetric[] {
  const days = eachDayOfInterval({ start: from, end: to });
  const rand = rng(hashSeed(seed + "gsc"));
  const baseClicks = 25 + Math.floor(rand() * 40);
  const baseImpr = 900 + Math.floor(rand() * 1200);
  const basePos = 24 + rand() * 8;

  return days.map((d) => {
    const progress = progressOf(d, refEnd);
    // Weekends dip a little.
    const dow = d.getDay();
    const weekend = dow === 5 || dow === 6 ? 0.78 : 1;
    const noise = 0.8 + rand() * 0.4;
    const growth = 1 + progress * 0.8; // +80% from oldest to most recent day
    const clicks = Math.round(baseClicks * growth * weekend * noise);
    const impressions = Math.round(baseImpr * growth * weekend * noise);
    // Position improves (gets smaller) as days get more recent.
    const position = +(basePos - progress * 9 + (rand() - 0.5) * 1.5).toFixed(1);
    return {
      date: format(d, "yyyy-MM-dd"),
      clicks,
      impressions,
      position: Math.max(1, position),
    };
  });
}

export function mockGa4DailySessions(
  seed: string,
  from: Date,
  to: Date,
  refEnd: Date
): { date: string; sessions: number }[] {
  const days = eachDayOfInterval({ start: from, end: to });
  const rand = rng(hashSeed(seed + "ga"));
  const base = 120 + Math.floor(rand() * 160);
  return days.map((d) => {
    const progress = progressOf(d, refEnd);
    const dow = d.getDay();
    const weekend = dow === 5 || dow === 6 ? 0.8 : 1;
    const noise = 0.82 + rand() * 0.36;
    const growth = 1 + progress * 0.7;
    return {
      date: format(d, "yyyy-MM-dd"),
      sessions: Math.round(base * growth * weekend * noise),
    };
  });
}

// A pool of realistic Hebrew search queries for demo keyword movement.
const DEMO_QUERIES = [
  "עורך דין גירושין",
  "הסכם ממון מחיר",
  "תביעת מזונות",
  "ייעוץ משפטי משפחה",
  "עורך דין צוואות וירושות",
  "הסכם גירושין",
  "משמורת ילדים",
  "עורך דין מקרקעין",
  "ליווי משפטי לעסקים",
  "תביעה ייצוגית",
  "עורך דין נדל\"ן תל אביב",
  "ייפוי כוח מתמשך",
  "הסכם שכירות מסחרי",
  "עורך דין דיני עבודה",
  "פיצויי פיטורין",
];

// Per-query metrics for a window. `better=true` returns the *current* (improved)
// positions; `better=false` returns the *previous* (worse) positions, so the
// report's "keywords that climbed" comparison has real movement to show.
export function mockSearchConsoleQueries(
  seed: string,
  better: boolean
): QueryMetric[] {
  const rand = rng(hashSeed(seed + "q"));
  return DEMO_QUERIES.map((query) => {
    const prevPos = 8 + rand() * 22; // previous-period position (worse)
    const gain = 1.5 + rand() * 9; // how much it climbed
    const position = better ? Math.max(1.2, prevPos - gain) : prevPos;
    const impressions = 200 + Math.floor(rand() * 1500);
    // More clicks once the term sits higher.
    const ctr = better ? 0.05 + rand() * 0.08 : 0.02 + rand() * 0.04;
    return {
      query,
      impressions,
      clicks: Math.round(impressions * ctr),
      position: +position.toFixed(1),
    };
  });
}
