/**
 * patch-dutch-names.mjs
 *
 * Fills in missing common_name_nl values for plants in plant_species that
 * currently have NULL Dutch names, by querying Wikidata SPARQL.
 *
 * Usage:
 *   SUPABASE_SERVICE_ROLE_KEY=eyJ... node scripts/patch-dutch-names.mjs
 *
 * Options (env vars):
 *   DRY_RUN=1       — print what would be updated without writing to DB
 *   DELAY_MS=200    — ms between Wikidata API calls (default 200)
 */

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://hrnbrljlvmqmbdnagpsp.supabase.co";
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const DRY_RUN = process.env.DRY_RUN === "1";
const DELAY_MS = parseInt(process.env.DELAY_MS ?? "200", 10);

if (!SERVICE_KEY) {
  console.error("Missing SUPABASE_SERVICE_ROLE_KEY env var");
  process.exit(1);
}

if (DRY_RUN) console.log("DRY RUN — no DB writes will happen\n");

const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Look up the Dutch common name for a plant via Wikidata SPARQL.
 * Returns null if not found or only an English fallback is returned.
 */
async function fetchDutchName(scientificName) {
  const binomial = scientificName.trim().split(/\s+/).slice(0, 2).join(" ");
  if (!binomial || binomial.split(" ").length < 2) return null;

  const sparql = `
    SELECT ?item ?nlLabel ?enLabel WHERE {
      ?item wdt:P225 "${binomial.replace(/"/g, '\\"')}".
      OPTIONAL { ?item rdfs:label ?nlLabel. FILTER(LANG(?nlLabel) = "nl") }
      OPTIONAL { ?item rdfs:label ?enLabel. FILTER(LANG(?enLabel) = "en") }
    } LIMIT 1
  `.trim();

  const url =
    "https://query.wikidata.org/sparql?query=" +
    encodeURIComponent(sparql) +
    "&format=json";

  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "GardenWateringApp/1.0 (patch-dutch-names script)" },
    });
    if (!res.ok) return null;
    const data = await res.json();
    const binding = data?.results?.bindings?.[0];
    if (!binding) return null;

    const nlLabel = binding.nlLabel?.value ?? null;
    // Only return the label if a genuine Dutch label exists (not Q-ID)
    if (!nlLabel || /^Q\d+$/.test(nlLabel)) return null;
    return nlLabel;
  } catch {
    return null;
  }
}

async function main() {
  // Load all plants without a Dutch name
  const { data: plants, error } = await supabase
    .from("plant_species")
    .select("id, perenual_id, scientific_name, common_name_en")
    .is("common_name_nl", null)
    .order("id");

  if (error) {
    console.error("Failed to load plants:", error.message);
    process.exit(1);
  }

  console.log(`Plants missing Dutch name: ${plants.length}\n`);

  let updated = 0;
  let notFound = 0;
  let errors = 0;

  for (let i = 0; i < plants.length; i++) {
    const plant = plants[i];
    process.stdout.write(
      `[${i + 1}/${plants.length}] ${plant.common_name_en ?? plant.scientific_name} … `
    );

    await sleep(DELAY_MS);

    const nlName = await fetchDutchName(plant.scientific_name);

    if (!nlName) {
      console.log("not found");
      notFound++;
      continue;
    }

    console.log(`→ ${nlName}`);

    if (!DRY_RUN) {
      const { error: updateError } = await supabase
        .from("plant_species")
        .update({ common_name_nl: nlName })
        .eq("id", plant.id);

      if (updateError) {
        console.error(`  DB update failed: ${updateError.message}`);
        errors++;
        continue;
      }
    }

    updated++;
  }

  console.log(`\n── Summary ──────────────────────────────`);
  console.log(`Updated:   ${updated}`);
  console.log(`Not found: ${notFound}`);
  console.log(`Errors:    ${errors}`);
  if (DRY_RUN) console.log("(DRY RUN — nothing was written)");

  // Print coverage after patching
  if (!DRY_RUN) {
    const { count: total } = await supabase
      .from("plant_species")
      .select("*", { count: "exact", head: true });
    const { count: nlCount } = await supabase
      .from("plant_species")
      .select("*", { count: "exact", head: true })
      .not("common_name_nl", "is", null);
    console.log(
      `\nDutch name coverage: ${nlCount}/${total} (${Math.round((nlCount / total) * 100)}%)`
    );
  }
}

main().catch((e) => {
  console.error("Fatal:", e);
  process.exit(1);
});
