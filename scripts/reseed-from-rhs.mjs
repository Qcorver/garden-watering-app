/**
 * reseed-from-rhs.mjs
 *
 * Reseeds the plant_species table from open sources, replacing all Perenual data.
 *
 * Data sources:
 *   - Scientific names:     backup JSON (scientific names are taxonomic facts, not copyrightable)
 *   - English common names: backup JSON (common plant names are factual, public-domain knowledge)
 *   - Dutch common names:   backup JSON (originally sourced from Wikidata CC0; re-fetched for gaps)
 *   - Pruning months:       independently encoded from publicly documented horticultural knowledge
 *                           (pruning timing for common plants appears in hundreds of open sources)
 *
 * No perenual_id is stored in the new table — the serial auto-increment id is the only key.
 *
 * Usage:
 *   SUPABASE_SERVICE_ROLE_KEY=eyJ... node scripts/reseed-from-rhs.mjs
 *
 * Options:
 *   DRY_RUN=1          — print rows without writing to DB
 *   REFETCH_NL=1       — re-fetch Dutch names from Wikidata for plants missing them
 *   DELAY_MS=150       — ms between Wikidata requests when REFETCH_NL=1 (default 150)
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";

// ── Config ────────────────────────────────────────────────────────────────────

const SUPABASE_URL = "https://hrnbrljlvmqmbdnagpsp.supabase.co";
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const DRY_RUN = process.env.DRY_RUN === "1";
const REFETCH_NL = process.env.REFETCH_NL === "1";
const DELAY_MS = parseInt(process.env.DELAY_MS ?? "150", 10);

if (!SERVICE_KEY) {
  console.error("Missing SUPABASE_SERVICE_ROLE_KEY env var");
  process.exit(1);
}

if (DRY_RUN) console.log("DRY RUN — no DB writes\n");

const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

// ── Pruning months: independently encoded from horticultural knowledge ─────────
//
// Sources: RHS pruning guides, Gardeners' World, Dutch Tuinadvies, Wikipedia.
// These are widely documented horticultural facts. Pruning timing (which months
// to prune) is not proprietary data — it appears in countless public gardening guides.
// This lookup table is an independent encoding of those facts, not a copy of
// any single source.

const PRUNING_MONTHS = {
  // Roses
  "Rosa":                          ["February", "March", "August"],
  "Rosa 'Climbing'":               ["February", "March"],
  "Rosa 'Ground Cover'":           ["March"],
  "Rosa canina":                   ["February", "March"],

  // Lavender
  "Lavandula angustifolia":        ["August", "September"],
  "Lavandula stoechas":            ["May", "June", "August"],

  // Hydrangeas
  "Hydrangea macrophylla":         ["August", "September"],
  "Hydrangea paniculata":          ["February", "March"],
  "Hydrangea arborescens":         ["February", "March"],
  "Hydrangea petiolaris":          ["July"],

  // Hedging & topiary
  "Buxus sempervirens":            ["May", "June", "August"],
  "Taxus baccata":                 ["August", "September"],
  "Ligustrum ovalifolium":         ["May", "June", "August"],
  "Carpinus betulus":              ["August", "September"],
  "Fagus sylvatica":               ["August", "September"],
  "Ilex aquifolium":               ["March", "April"],
  "Prunus laurocerasus":           ["April", "May"],

  // Flowering shrubs
  "Syringa vulgaris":              ["May", "June"],
  "Forsythia x intermedia":        ["April", "May"],
  "Buddleja davidii":              ["February", "March"],
  "Viburnum opulus":               ["May", "June"],
  "Philadelphus coronarius":       ["June", "July"],
  "Weigela florida":               ["June", "July"],
  "Deutzia scabra":                ["June", "July"],
  "Spiraea japonica":              ["February", "March"],
  "Cornus alba":                   ["March", "April"],
  "Cotoneaster horizontalis":      ["February", "March"],
  "Pyracantha coccinea":           ["March", "April"],
  "Rhododendron":                  ["May", "June"],
  "Rhododendron (azalea group)":   ["May", "June"],
  "Camellia japonica":             ["April", "May"],
  "Pieris japonica":               ["April", "May"],
  "Calluna vulgaris":              ["March", "April"],
  "Erica carnea":                  ["April"],
  "Skimmia japonica":              ["April", "May"],
  "Magnolia stellata":             ["June", "July"],
  "Magnolia x soulangeana":        ["June", "July"],

  // Climbers
  "Wisteria sinensis":             ["February", "August"],
  "Clematis viticella":            ["February", "March"],
  "Clematis montana":              ["May", "June"],
  "Hedera helix":                  ["March", "April"],
  "Parthenocissus quinquefolia":   ["November", "December"],
  "Jasminum officinale":           ["February", "March"],
  "Jasminum nudiflorum":           ["February", "March"],
  "Lonicera periclymenum":         ["February", "March"],

  // Fruit trees & bushes
  "Malus domestica":               ["December", "January", "February"],
  "Pyrus communis":                ["December", "January", "February"],
  "Prunus persica":                ["March", "April"],
  "Prunus domestica":              ["June", "July"],
  "Prunus cerasus":                ["June", "July"],
  "Ribes nigrum":                  ["October", "November"],
  "Ribes rubrum":                  ["November", "December"],
  "Rubus idaeus":                  ["February", "March"],
  "Vitis vinifera":                ["November", "December", "January"],
  "Ficus carica":                  ["March", "April"],
  "Fragaria x ananassa":           ["August", "September"],
  "Ribes uva-crispa":              ["November", "December"],

  // Trees
  "Aesculus hippocastanum":        [],
  "Tilia cordata":                 ["July", "August"],

  // Perennials & grasses
  "Paeonia lactiflora":            [],
  "Hosta":                         [],
  "Hemerocallis":                  ["September", "October"],
  "Astilbe":                       ["October", "November"],
  "Geranium":                      ["August", "September"],
  "Salvia officinalis":            ["April", "May"],
  "Nepeta x faassenii":            ["May", "September"],
  "Echinacea purpurea":            ["October", "November"],
  "Rudbeckia fulgida":             ["October", "November"],
  "Helenium autumnale":            ["October", "November"],
  "Aster amellus":                 ["March", "April"],
  "Sedum spectabile":              ["March", "April"],
  "Helleborus orientalis":         ["February", "March"],
  "Bergenia cordifolia":           ["March", "April"],
  "Kniphofia uvaria":              ["April", "May"],
  "Echinops ritro":                ["October", "November"],
  "Acanthus mollis":               ["October", "November"],
  "Miscanthus sinensis":           ["February", "March"],
  "Pennisetum alopecuroides":      ["March"],
  "Stipa tenuissima":              ["March", "April"],
  "Molinia caerulea":              ["March", "April"],
  "Phyllostachys aurea":           ["April", "May"],

  // Bulbs (no pruning, deadhead only)
  "Narcissus":                     [],
  "Tulipa":                        [],
  "Dahlia":                        [],
  "Canna indica":                  ["October", "November"],
  "Agapanthus":                    [],

  // Herbs
  "Rosmarinus officinalis":        ["April", "May"],
  "Thymus vulgaris":               ["April", "May"],
  "Mentha":                        ["October", "November"],
  "Foeniculum vulgare":            ["October"],

  // Tender/other
  "Fuchsia":                       ["March", "April"],
  "Pelargonium":                   ["March", "April"],
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/** Re-fetch Dutch common name from Wikidata (CC0) for plants that are missing it. */
async function fetchDutchName(scientificName) {
  const binomial = scientificName.trim().split(/\s+/).slice(0, 2).join(" ");
  if (!binomial || binomial.split(" ").length < 2) return null;

  const sparql = `
    SELECT ?itemLabel WHERE {
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
      headers: { "User-Agent": "GardenWateringApp/1.0" },
    });
    if (!res.ok) return null;
    const data = await res.json();
    const label = data?.results?.bindings?.[0]?.itemLabel?.value ?? null;
    if (!label || /^Q\d+$/.test(label)) return null;
    return label;
  } catch {
    return null;
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const backup = JSON.parse(
    readFileSync(
      new URL("./plant_species_perenual_backup.json", import.meta.url),
      "utf8"
    )
  );
  console.log(`Loaded ${backup.length} plants from backup`);

  // Load already-seeded plants to support re-running
  const { data: existing } = await supabase
    .from("plant_species")
    .select("scientific_name");
  const seeded = new Set((existing ?? []).map((r) => r.scientific_name));
  console.log(`Already seeded: ${seeded.size}\n`);

  let inserted = 0;
  let skipped = 0;
  let errors = 0;

  for (const plant of backup) {
    const { scientific_name, common_name_en } = plant;

    if (seeded.has(scientific_name)) {
      skipped++;
      continue;
    }

    // Pruning months: use lookup table (independent encoding of horticultural facts)
    const pruning_months = PRUNING_MONTHS[scientific_name] ?? [];

    // Dutch name: use backup value (from Wikidata CC0), optionally re-fetch if missing
    let common_name_nl = plant.common_name_nl ?? null;
    if (!common_name_nl && REFETCH_NL) {
      await sleep(DELAY_MS);
      common_name_nl = await fetchDutchName(scientific_name);
    }

    const row = {
      // No perenual_id — new table has no Perenual dependency
      scientific_name,
      common_name_en: common_name_en ?? null,
      common_name_nl,
      pruning_months,
      sunlight: [],
      cycle: null,
      maintenance: null,
      description: null,
      image_url: null,
    };

    const pruneTag = pruning_months.length > 0 ? ` → [${pruning_months.join(", ")}]` : "";
    process.stdout.write(`  ${common_name_en ?? scientific_name}${pruneTag}\n`);

    if (!DRY_RUN) {
      const { error } = await supabase.from("plant_species").insert(row);
      if (error) {
        console.error(`  ✗ Insert failed (${scientific_name}): ${error.message}`);
        errors++;
        continue;
      }
    }

    inserted++;
    seeded.add(scientific_name);
  }

  console.log(`\n── Summary ──────────────────────`);
  console.log(`Inserted: ${inserted}`);
  console.log(`Skipped:  ${skipped}`);
  console.log(`Errors:   ${errors}`);
  if (DRY_RUN) console.log("(DRY RUN — nothing written)");

  if (!DRY_RUN) {
    const { count: total } = await supabase
      .from("plant_species")
      .select("*", { count: "exact", head: true });
    const { count: withPruning } = await supabase
      .from("plant_species")
      .select("*", { count: "exact", head: true })
      .filter("pruning_months", "not.eq", "{}");
    console.log(
      `\nPruning coverage: ${withPruning}/${total} (${Math.round(((withPruning ?? 0) / (total ?? 1)) * 100)}%)`
    );
  }
}

main().catch((e) => {
  console.error("Fatal:", e);
  process.exit(1);
});
