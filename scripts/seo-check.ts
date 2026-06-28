/**
 * Verify the Google Search Console connection and list accessible properties.
 *
 *   npm run report:seo:check
 *
 * Run this right after pasting your service-account key + SC_SITE_URL into
 * .env. It confirms the credentials work and prints the exact property
 * strings you can use for SC_SITE_URL.
 */
import "dotenv/config";
import { verifyConnection } from "../src/lib/searchConsole";

async function main() {
  console.log("[seo:check] Verifying Search Console connection...\n");
  const result = await verifyConnection();

  if (result.serviceAccountEmail) {
    console.log(`Service account: ${result.serviceAccountEmail}`);
  }

  if (!result.ok) {
    console.error(`\n❌ Connection failed: ${result.error}\n`);
    if (result.serviceAccountEmail) {
      console.error(
        "If this is a permissions error, make sure the service-account email\n" +
          "above is added as a user on the property in Search Console\n" +
          "(Settings → Users and permissions).\n"
      );
    }
    process.exit(1);
  }

  const sites = result.sites ?? [];
  if (sites.length === 0) {
    console.log(
      "\n⚠️  Connected, but the service account can't see any properties yet.\n" +
        "Add it as a user on your property in Search Console\n" +
        "(Settings → Users and permissions), then re-run this check.\n"
    );
    process.exit(1);
  }

  console.log(`\n✅ Connected. Accessible properties (use one as SC_SITE_URL):\n`);
  for (const s of sites) {
    console.log(`   ${s.siteUrl}   (${s.permissionLevel})`);
  }

  const configured = process.env.SC_SITE_URL;
  if (configured) {
    console.log(
      result.configuredSiteAccessible
        ? `\n✅ SC_SITE_URL="${configured}" is accessible — you're ready: npm run report:seo`
        : `\n⚠️  SC_SITE_URL="${configured}" is NOT in the list above. Copy an exact value from the list.`
    );
  } else {
    console.log(`\nℹ️  SC_SITE_URL is not set. Copy one of the values above into .env.`);
  }
}

main().catch((err) => {
  console.error("[seo:check] Fatal error:", err);
  process.exit(1);
});
