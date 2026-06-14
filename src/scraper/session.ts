import { promises as fs } from "fs";
import path from "path";
import type { BrowserContext } from "playwright";

// ---------------------------------------------------------------------------
// Session/cookie persistence
//
// Playwright can serialise a browser context's cookies + localStorage to a
// "storage state" JSON file. We save it after the first successful login and
// reuse it on subsequent syncs so we don't have to log in every time.
// ---------------------------------------------------------------------------

export function sessionPath(): string {
  return process.env.SESSION_STORAGE_PATH || "./storage/leadmanager-session.json";
}

/** Does a cached session file exist? */
export async function hasSession(): Promise<boolean> {
  try {
    await fs.access(sessionPath());
    return true;
  } catch {
    return false;
  }
}

/** Persist the current context's storage state to disk. */
export async function saveSession(context: BrowserContext): Promise<void> {
  const p = sessionPath();
  await fs.mkdir(path.dirname(p), { recursive: true });
  await context.storageState({ path: p });
  console.log(`[session] Saved authenticated session to ${p}`);
}

/** Path to pass as `storageState` when creating a context, if one exists. */
export async function sessionStateOption(): Promise<string | undefined> {
  return (await hasSession()) ? sessionPath() : undefined;
}

/** Remove a stale/invalid session file so the next run logs in fresh. */
export async function clearSession(): Promise<void> {
  try {
    await fs.unlink(sessionPath());
    console.log("[session] Cleared cached session.");
  } catch {
    /* nothing to clear */
  }
}
