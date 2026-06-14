// A single lead row as extracted from the Lead Manager UI, before it is
// normalised and persisted to the database.
export interface ScrapedLead {
  externalId: string;
  campaignName: string;
  receivedAt: Date;
  status: string;
  source: string;
}

export interface ScrapeResult {
  leads: ScrapedLead[];
  // True when the data came from the live site; false when a fallback /
  // mock source was used (e.g. credentials missing).
  live: boolean;
}
