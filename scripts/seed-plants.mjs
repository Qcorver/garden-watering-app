/**
 * seed-plants.mjs
 *
 * One-time script to populate the plant_species table.
 * Fetches species list from Perenual (paginated), enriches each plant with
 * pruning details from Perenual, and looks up Dutch common names from Wikidata.
 *
 * Usage:
 *   PERENUAL_API_KEY=sk-... SUPABASE_SERVICE_ROLE_KEY=eyJ... node scripts/seed-plants.mjs
 *
 * Get PERENUAL_API_KEY from: https://perenual.com/api/key-list
 * Get SUPABASE_SERVICE_ROLE_KEY from: Supabase dashboard → Settings → API → service_role key
 *
 * The script is resumable: plants already in the DB (by perenual_id) are skipped.
 * Re-run with SKIP_DETAILS=1 to only fetch Dutch names for plants that have none yet.
 */

import { createClient } from "@supabase/supabase-js";

// ── Config ────────────────────────────────────────────────────────────────────

const PERENUAL_KEY = process.env.PERENUAL_API_KEY;
const SUPABASE_URL = "https://hrnbrljlvmqmbdnagpsp.supabase.co";
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const PAGES = parseInt(process.env.PAGES ?? "30", 10); // 30 pages ≈ 300 plants
const DELAY_MS = 400; // delay between Perenual API calls
const WIKIDATA_DELAY_MS = 150;

if (!PERENUAL_KEY) {
  console.error("Missing PERENUAL_API_KEY env var");
  process.exit(1);
}
if (!SERVICE_KEY) {
  console.error("Missing SUPABASE_SERVICE_ROLE_KEY env var");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

// ── Helpers ───────────────────────────────────────────────────────────────────

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function perenualGet(path) {
  const url = `https://perenual.com/api/${path}&key=${PERENUAL_KEY}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Perenual ${path} → ${res.status}`);
  return res.json();
}

/**
 * Look up the Dutch common name for a plant via Wikidata SPARQL.
 * Uses the scientific name (genus+species) as the key.
 * Returns null if not found.
 */
async function fetchDutchName(scientificName) {
  // Use first two words (genus + species), strip cultivar/variety suffixes
  const binomial = scientificName.trim().split(/\s+/).slice(0, 2).join(" ");
  if (!binomial || binomial.split(" ").length < 2) return null;

  const sparql = `
    SELECT ?item ?itemLabel WHERE {
      ?item wdt:P225 "${binomial.replace(/"/g, '\\"')}".
      SERVICE wikibase:label { bd:serviceParam wikibase:language "nl,en". }
    } LIMIT 1
  `.trim();

  const url =
    "https://query.wikidata.org/sparql?query=" +
    encodeURIComponent(sparql) +
    "&format=json";

  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "GardenWateringApp/1.0 (seed script)" },
    });
    if (!res.ok) return null;
    const data = await res.json();
    const label = data?.results?.bindings?.[0]?.itemLabel?.value ?? null;
    // Wikidata falls back to English when no Dutch label exists; skip those
    if (!label || /^Q\d+$/.test(label)) return null;
    // If the returned label matches the English name closely, it may not be Dutch
    return label;
  } catch {
    return null;
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`Starting plant seeding: ${PAGES} pages from Perenual…`);

  // Load existing perenual_ids so we can skip already-seeded plants
  const { data: existing } = await supabase
    .from("plant_species")
    .select("perenual_id");
  const seededIds = new Set((existing ?? []).map((r) => r.perenual_id));
  console.log(`Already in DB: ${seededIds.size} plants`);

  let inserted = 0;
  let skipped = 0;
  let errors = 0;

  for (let page = 1; page <= PAGES; page++) {
    console.log(`\nPage ${page}/${PAGES}…`);

    let listData;
    try {
      listData = await perenualGet(`species-list?page=${page}`);
    } catch (e) {
      console.error(`  List fetch failed: ${e.message}`);
      errors++;
      await sleep(DELAY_MS * 3);
      continue;
    }

    const plants = listData.data ?? [];
    if (plants.length === 0) {
      console.log("  No more results, stopping.");
      break;
    }

    for (const plant of plants) {
      if (seededIds.has(plant.id)) {
        skipped++;
        continue;
      }

      const sciName = Array.isArray(plant.scientific_name)
        ? plant.scientific_name[0]
        : plant.scientific_name ?? "";

      if (!sciName) {
        skipped++;
        continue;
      }

      // Fetch full details for pruning months
      let details = null;
      try {
        await sleep(DELAY_MS);
        details = await perenualGet(`species/details/${plant.id}?`);
      } catch (e) {
        console.warn(`  Details failed for ${plant.id}: ${e.message}`);
      }

      const pruningMonths = details?.pruning_month ?? [];
      const sunlight = details?.sunlight ?? plant.sunlight ?? [];
      const cycle = details?.cycle ?? plant.cycle ?? null;
      const maintenance = details?.maintenance ?? null;
      const description = details?.description ?? null;
      const imageUrl =
        details?.default_image?.medium_url ??
        details?.default_image?.thumbnail ??
        plant.default_image?.thumbnail ??
        null;

      // Fetch Dutch name from Wikidata
      await sleep(WIKIDATA_DELAY_MS);
      const nlName = await fetchDutchName(sciName);

      const row = {
        perenual_id: plant.id,
        scientific_name: sciName,
        common_name_en: details?.common_name ?? plant.common_name ?? null,
        common_name_nl: nlName,
        pruning_months: pruningMonths,
        sunlight: Array.isArray(sunlight) ? sunlight : [sunlight],
        cycle,
        maintenance,
        description,
        image_url: imageUrl,
      };

      const { error } = await supabase
        .from("plant_species")
        .upsert(row, { onConflict: "perenual_id" });

      if (error) {
        console.error(`  Insert failed (${sciName}): ${error.message}`);
        errors++;
      } else {
        const nlTag = nlName ? ` [NL: ${nlName}]` : "";
        const pruneTag =
          pruningMonths.length > 0 ? ` pruning: ${pruningMonths.join(",")}` : "";
        console.log(`  ✓ ${row.common_name_en} (${sciName})${nlTag}${pruneTag}`);
        inserted++;
        seededIds.add(plant.id);
      }
    }
  }

  console.log(`\nDone. Inserted: ${inserted}, Skipped: ${skipped}, Errors: ${errors}`);

  // Print summary of Dutch name coverage
  const { count: totalCount } = await supabase
    .from("plant_species")
    .select("*", { count: "exact", head: true });
  const { count: nlCount } = await supabase
    .from("plant_species")
    .select("*", { count: "exact", head: true })
    .not("common_name_nl", "is", null);

  console.log(
    `Dutch name coverage: ${nlCount}/${totalCount} (${Math.round((nlCount / totalCount) * 100)}%)`
  );
}

main().catch((e) => {
  console.error("Fatal:", e);
  process.exit(1);
});
