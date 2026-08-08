/**
 * fix-dutch-names-claude.mjs
 *
 * Fixes broken Dutch names in plant_species:
 *  - Latin name copied into common_name_nl (e.g. "Anemone hybrida")
 *  - English name copied into common_name_nl (e.g. "Kousa Dogwood")
 *  - Known wrong translations (e.g. Pieris "Vuurboom" → "Rotsheide")
 *  - null Dutch names
 *
 * Uses Claude to evaluate batches and suggest the correct Dutch common name.
 * Hardcoded fixes are applied first (fast, no API call needed).
 *
 * Usage:
 *   SUPABASE_SERVICE_ROLE_KEY=eyJ... ANTHROPIC_API_KEY=sk-ant-... \
 *     node scripts/fix-dutch-names-claude.mjs
 *
 * Options:
 *   DRY_RUN=1      — print updates without writing to DB
 *   BATCH_SIZE=30  — plants per Claude request (default 30)
 *   DELAY_MS=500   — ms between Claude requests (default 500)
 *   SKIP_HARDCODED=1 — skip the hardcoded fixes phase
 */

import { createClient } from "@supabase/supabase-js";
import Anthropic from "@anthropic-ai/sdk";

const SUPABASE_URL = "https://hrnbrljlvmqmbdnagpsp.supabase.co";
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
const DRY_RUN = process.env.DRY_RUN === "1";
const BATCH_SIZE = parseInt(process.env.BATCH_SIZE ?? "30", 10);
const DELAY_MS = parseInt(process.env.DELAY_MS ?? "500", 10);
const SKIP_HARDCODED = process.env.SKIP_HARDCODED === "1";

if (!SERVICE_KEY) { console.error("Missing SUPABASE_SERVICE_ROLE_KEY"); process.exit(1); }
if (!ANTHROPIC_KEY) { console.error("Missing ANTHROPIC_API_KEY"); process.exit(1); }
if (DRY_RUN) console.log("DRY RUN — no DB writes\n");

const supabase = createClient(SUPABASE_URL, SERVICE_KEY);
const anthropic = new Anthropic({ apiKey: ANTHROPIC_KEY });

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// ── Phase 1: hardcoded fixes ──────────────────────────────────────────────────

// Each entry: [scientificNamePattern (string = exact match, regex = pattern), correctNLName]
// scientificNamePattern can be a string (exact match on scientific_name) or
// a prefix string ending in '*' (starts-with match).
const HARDCODED_FIXES = [
  // Known botanical error: Pieris is Rotsheide, not Vuurboom (Vuurboom = Embothrium)
  ["Pieris japonica*", "Rotsheide"],

  // English names leaked in
  ["Cornus kousa*", "Japanse kornoelje"],
  ["Cornus florida*", "Bloemend kornoelje"],
  ["Cercis canadensis*", "Judasboom"],
  ["Cercis siliquastrum*", "Judasboom"],

  // Obvious nulls with well-known Dutch names
  ["Amelanchier lamarckii", "Krentenboompje"],
  ["Amelanchier lamarckii*", "Krentenboompje"],
  ["Cupressocyparis x leylandii", "Leylandcypres"],
  ["× Cuprocyparis leylandii", "Leylandcypres"],
  ["Laburnum x watereri 'Vossii'", "Goudenregen"],
  ["Laburnum anagyroides*", "Gewone goudenregen"],
  ["Photinia x fraseri*", "Glansmispel"],
  ["Photinia fraseri*", "Glansmispel"],

  // Latin copied — high-priority known names
  ["Liriodendron tulipifera*", "Tulpenboom"],
  ["Cercidiphyllum japonicum*", "Katsuraboom"],
  ["Cryptomeria japonica*", "Japanse ceder"],
  ["Cordyline australis*", "Koolpalm"],
  ["Rudbeckia fulgida*", "Zonnehoed"],
  ["Rudbeckia hirta*", "Ruige zonnehoed"],
  ["Bergenia cordifolia*", "Schoenlappersplant"],
  ["Bergenia*", "Schoenlappersplant"],
  ["Anemone hupehensis*", "Herfstanemoon"],
  ["Anemone hybrida*", "Herfstanemoon"],
  ["Anemone japonica*", "Japanse anemoon"],
  ["Magnolia grandiflora*", "Beverboom"],
  ["Magnolia stellata*", "Steranijsboom"],
  ["Magnolia soulangeana*", "Beverboom"],
  ["Acer griseum*", "Papieresdoorn"],
  ["Acer davidii*", "Slangeneschoors"],
  ["Acer pensylvanicum*", "Gestreepte esdoorn"],
];

function matchesPattern(pattern, scientificName) {
  if (pattern.endsWith("*")) {
    return scientificName.startsWith(pattern.slice(0, -1));
  }
  return scientificName === pattern;
}

async function applyHardcodedFixes() {
  console.log("\n── Phase 1: Hardcoded fixes ─────────────────────────────────");

  const { data: allPlants, error } = await supabase
    .from("plant_species")
    .select("id, scientific_name, common_name_nl");

  if (error) { console.error("Failed to fetch plants:", error.message); return 0; }

  let applied = 0;

  for (const plant of allPlants) {
    for (const [pattern, correctName] of HARDCODED_FIXES) {
      if (matchesPattern(pattern, plant.scientific_name)) {
        if (plant.common_name_nl === correctName) break; // already correct
        console.log(`  ${plant.scientific_name}: "${plant.common_name_nl ?? "null"}" → "${correctName}"`);
        if (!DRY_RUN) {
          const { error: updateError } = await supabase
            .from("plant_species")
            .update({ common_name_nl: correctName })
            .eq("id", plant.id);
          if (updateError) console.error(`    Update failed: ${updateError.message}`);
          else applied++;
        } else {
          applied++;
        }
        break;
      }
    }
  }

  // Delete the malformed "Veronica ×" record
  const malformed = allPlants.find((p) => p.scientific_name === "Veronica ×");
  if (malformed) {
    console.log(`  Deleting malformed record: "Veronica ×" (id ${malformed.id})`);
    if (!DRY_RUN) {
      const { error: delError } = await supabase
        .from("plant_species")
        .delete()
        .eq("id", malformed.id);
      if (delError) console.error(`    Delete failed: ${delError.message}`);
      else applied++;
    } else {
      applied++;
    }
  }

  console.log(`  Applied: ${applied} hardcoded fixes`);
  return applied;
}

// ── Phase 2: Claude batch fixes ───────────────────────────────────────────────

function looksLikeLatin(nlName, scientificName) {
  if (!nlName) return false;
  // Strip cultivar part from scientific name for comparison
  const sciBase = scientificName.split("'")[0].trim().toLowerCase();
  const nl = nlName.toLowerCase();
  // NL name is the same as (or starts with) the scientific genus/species
  if (nl === sciBase) return true;
  if (nl === scientificName.toLowerCase()) return true;
  // NL name starts with the genus name (first word of scientific)
  const genus = sciBase.split(" ")[0];
  if (nl.startsWith(genus) && /^[a-z]/.test(nl)) return true;
  return false;
}

function looksLikeEnglish(nlName) {
  if (!nlName) return false;
  // Simple heuristic: contains typical English garden words
  const englishWords = ["dogwood", "redbud", "viburnum", "serviceberry", "snowberry",
    "beautyberry", "spicebush", "sweetshrub", "witch hazel", "chokeberry", "elderberry",
    "ninebark", "buttonbush", "sweetspire", "virginia", "american", "eastern", "western"];
  const lower = nlName.toLowerCase();
  return englishWords.some((w) => lower.includes(w));
}

async function askClaudeForDutchNames(plants) {
  const plantList = plants
    .map((p) => {
      const currentNL = p.common_name_nl ?? "null";
      return `- ${p.scientific_name} | EN: ${p.common_name_en ?? "?"} | Current NL: ${currentNL}`;
    })
    .join("\n");

  const prompt = `You are a Dutch horticultural name expert. For each plant below, provide the correct and most recognizable Dutch common name as used by Dutch gardeners and garden centers.

Rules:
- Return the Dutch name that a Dutch gardener would recognize in a garden center or gardening app
- If the current Dutch name is already correct and well-known, return it unchanged
- If the current Dutch name is a Latin scientific name, replace it with the real Dutch name
- If the current Dutch name is English, replace it with the Dutch name
- If no well-known Dutch name exists, use the genus name (it may have been adopted directly into Dutch)
- Capitalize the first letter of the Dutch name
- Return a JSON object where keys are the exact scientific names and values are the Dutch common name strings

Format: { "Genus species": "Dutch name", ... }

Plants:
${plantList}

Respond with ONLY valid JSON, no explanation, no markdown code fences.`;

  const response = await anthropic.messages.create({
    model: "claude-opus-4-6",
    max_tokens: 4096,
    messages: [{ role: "user", content: prompt }],
  });

  const text = response.content.find((b) => b.type === "text")?.text ?? "";
  const cleaned = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();

  try {
    return JSON.parse(cleaned);
  } catch {
    console.error("  Failed to parse Claude response:", text.slice(0, 300));
    return {};
  }
}

async function applyClaudeFixes() {
  console.log("\n── Phase 2: Claude batch fixes ──────────────────────────────");

  const { data: allPlants, error } = await supabase
    .from("plant_species")
    .select("id, scientific_name, common_name_nl, common_name_en");

  if (error) { console.error("Failed to fetch plants:", error.message); return; }

  // Collect plants that need fixing
  const needsFix = allPlants.filter((p) =>
    p.common_name_nl === null ||
    looksLikeLatin(p.common_name_nl, p.scientific_name) ||
    looksLikeEnglish(p.common_name_nl)
  );

  console.log(`Plants needing Dutch name fix: ${needsFix.length}`);
  if (needsFix.length === 0) { console.log("Nothing to do."); return; }

  let updated = 0;
  let unchanged = 0;
  let errors = 0;

  for (let i = 0; i < needsFix.length; i += BATCH_SIZE) {
    const batch = needsFix.slice(i, i + BATCH_SIZE);
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(needsFix.length / BATCH_SIZE);
    process.stdout.write(`Batch ${batchNum}/${totalBatches} (${batch.length} plants)… `);

    let nameMap;
    try {
      nameMap = await askClaudeForDutchNames(batch);
    } catch (e) {
      console.error(`\n  Claude request failed: ${e.message}`);
      errors += batch.length;
      continue;
    }

    process.stdout.write("done\n");

    for (const plant of batch) {
      const suggestedName = nameMap[plant.scientific_name];

      if (!suggestedName) {
        console.log(`  ? ${plant.scientific_name} — not in response`);
        errors++;
        continue;
      }

      if (suggestedName === plant.common_name_nl) {
        unchanged++;
        continue;
      }

      const oldName = plant.common_name_nl ?? "null";
      console.log(`  ${plant.scientific_name}: "${oldName}" → "${suggestedName}"`);

      if (!DRY_RUN) {
        const { error: updateError } = await supabase
          .from("plant_species")
          .update({ common_name_nl: suggestedName })
          .eq("id", plant.id);

        if (updateError) {
          console.error(`    Update failed: ${updateError.message}`);
          errors++;
          continue;
        }
      }

      updated++;
    }

    if (i + BATCH_SIZE < needsFix.length) await sleep(DELAY_MS);
  }

  console.log(`\n── Phase 2 Summary ──────────────────────`);
  console.log(`Updated:   ${updated}`);
  console.log(`Unchanged: ${unchanged} (name was already correct)`);
  console.log(`Errors:    ${errors}`);
  if (DRY_RUN) console.log("(DRY RUN — nothing written)");

  if (!DRY_RUN) {
    const { count: total } = await supabase
      .from("plant_species")
      .select("*", { count: "exact", head: true });
    const { count: nlCount } = await supabase
      .from("plant_species")
      .select("*", { count: "exact", head: true })
      .not("common_name_nl", "is", null);
    console.log(
      `\nDutch name coverage: ${nlCount}/${total} (${Math.round(((nlCount ?? 0) / (total ?? 1)) * 100)}%)`,
    );
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  if (!SKIP_HARDCODED) await applyHardcodedFixes();
  await applyClaudeFixes();
}

main().catch((e) => { console.error("Fatal:", e); process.exit(1); });
