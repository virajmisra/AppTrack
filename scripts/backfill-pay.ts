/** Re-read `pay_range_text` from descriptions already cached in the `postings` table.
 *
 * The sync's enrichment pass sets pay at the same moment it writes `description_text`, so new
 * postings need nothing from this script. It exists for the rows enriched *before* pay was read
 * there — and for re-running if `extractPayRange` is ever widened, since a posting whose
 * description is already stored will never be re-enriched (`eligibility_checked_at` is set).
 *
 * Usage:
 *   node --experimental-strip-types scripts/backfill-pay.ts           # dry run, prints a sample
 *   node --experimental-strip-types scripts/backfill-pay.ts --apply   # writes
 */
import { readFileSync } from "node:fs";
import { extractPayRange } from "../src/lib/pay.ts";

const APPLY = process.argv.includes("--apply");
const PAGE = 200;
const CONCURRENCY = 10;

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n")
    .filter((l) => l.trim() && !l.trim().startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")];
    })
);

const URL_BASE = env.SUPABASE_URL;
const KEY = env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL_BASE || !KEY) throw new Error("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing from .env.local");
const auth = { apikey: KEY, Authorization: `Bearer ${KEY}` };

// Only rows that could possibly contain a figure — keeps a multi-MB description pull down.
// `order=id` is load-bearing: PostgREST gives no stable row order without it, so paging an
// unordered result set silently returns some rows twice and skips others. Same family of trap as
// the unranged 1000-row cap that scripts/db.sh exists to work around.
const QUERY =
  "postings?is_active=eq.true&pay_range_text=is.null&description_text=ilike.*%24*" +
  "&order=id&select=id,company,title,description_text";

const found: { id: string; company: string; title: string; pay: string }[] = [];
let scanned = 0;

for (let offset = 0; ; offset += PAGE) {
  const res = await fetch(`${URL_BASE}/rest/v1/${QUERY}`, {
    headers: { ...auth, Range: `${offset}-${offset + PAGE - 1}` },
  });
  if (!res.ok) throw new Error(`fetch failed: ${res.status} ${await res.text()}`);
  const rows = (await res.json()) as {
    id: string; company: string; title: string; description_text: string | null;
  }[];
  if (rows.length === 0) break;
  scanned += rows.length;

  for (const row of rows) {
    const pay = extractPayRange(row.description_text);
    if (pay) found.push({ id: row.id, company: row.company, title: row.title, pay });
  }
  if (rows.length < PAGE) break;
}

// Defence in depth against a paging overlap: never PATCH the same row twice.
const byId = new Map(found.map((f) => [f.id, f]));
found.length = 0;
found.push(...byId.values());

console.log(`scanned ${scanned} postings with a "$" in their description`);
console.log(`extracted pay for ${found.length}`);
console.log("\nsample:");
for (const f of found.slice(0, 15)) {
  console.log(`  ${f.company.slice(0, 24).padEnd(24)} ${f.pay.padEnd(24)} ${f.title.slice(0, 44)}`);
}

if (!APPLY) {
  console.log(`\nDRY RUN — nothing written. Re-run with --apply to write ${found.length} rows.`);
  process.exit(0);
}

let written = 0;
for (let i = 0; i < found.length; i += CONCURRENCY) {
  await Promise.all(
    found.slice(i, i + CONCURRENCY).map(async (f) => {
      const res = await fetch(`${URL_BASE}/rest/v1/postings?id=eq.${f.id}`, {
        method: "PATCH",
        headers: { ...auth, "Content-Type": "application/json" },
        body: JSON.stringify({ pay_range_text: f.pay }),
      });
      if (res.ok) written++;
      else console.error(`  failed ${f.id}: ${res.status} ${await res.text()}`);
    })
  );
}
console.log(`\nwrote ${written} rows`);
