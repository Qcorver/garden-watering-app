/**
 * fill-pruning-months.mjs
 *
 * Fills in empty pruning_months for plants in the plant_species table
 * by asking Claude to encode publicly available horticultural knowledge.
 *
 * Claude is used as a knowledgeable encoder, not a creative source —
 * pruning timing for common plants appears in RHS, Gardeners' World,
 * and hundreds of other open gardening guides.
 *
 * Usage:
 *   SUPABASE_SERVICE_ROLE_KEY=sb_secret_... ANTHROPIC_API_KEY=sk-ant-... \
 *     node scripts/fill-pruning-months.mjs
 *
 * Options:
 *   DRY_RUN=1     — print updates without writing to DB
 *   BATCH_SIZE=20 — plants per Claude request (default 20)
 *   DELAY_MS=500  — ms between Claude requests (default 500)
 */

import { createClient } from "@supabase/supabase-js";
import Anthropic from "@anthropic-ai/sdk";

// ── Config ────────────────────────────────────────────────────────────────────

const SUPABASE_URL = "https://hrnbrljlvmqmbdnagpsp.supabase.co";
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
const DRY_RUN = process.env.DRY_RUN === "1";
const BATCH_SIZE = parseInt(process.env.BATCH_SIZE ?? "20", 10);
const DELAY_MS = parseInt(process.env.DELAY_MS ?? "500", 10);

const VALID_MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

if (!SERVICE_KEY) { console.error("Missing SUPABASE_SERVICE_ROLE_KEY"); process.exit(1); }
if (!ANTHROPIC_KEY) { console.error("Missing ANTHROPIC_API_KEY"); process.exit(1); }
if (DRY_RUN) console.log("DRY RUN — no DB writes\n");

const supabase = createClient(SUPABASE_URL, SERVICE_KEY);
const anthropic = new Anthropic({ apiKey: ANTHROPIC_KEY });

// ── Helpers ───────────────────────────────────────────────────────────────────

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Ask Claude for pruning months for a batch of plants.
 * Returns a map of scientific_name → string[]
 */
async function askClaudeForPruningMonths(plants) {
  const plantList = plants
    .map((p) => `- ${p.scientific_name}${p.common_name_en ? ` (${p.common_name_en})` : ""}`)
    .join("\n");

  const prompt = `You are a horticultural reference encoder. For each plant below, return the typical pruning months based on widely published gardening knowledge (RHS, Gardeners' World, etc.).

Rules:
- Return ONLY valid month names: January, February, March, April, May, June, July, August, September, October, November, December
- If a plant requires no regular pruning (e.g. most trees, bulbs), return an empty array []
- Base the months on Northern Hemisphere timing
- For plants you are genuinely uncertain about, return []
- Return a JSON object where keys are the exact scientific names provided and values are arrays of month strings

Plants:
${plantList}

Respond with ONLY valid JSON, no explanation, no markdown code fences.`;

  const response = await anthropic.messages.create({
    model: "claude-opus-4-6",
    max_tokens: 4096,
    messages: [{ role: "user", content: prompt }],
  });

  const text = response.content.find((b) => b.type === "text")?.text ?? "";

  // Strip markdown fences if present
  const cleaned = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();

  let parsed;
  try {
    parsed = JSON.parse(cleaned);
  } catch (e) {
    console.error("  Failed to parse Claude response:", text.slice(0, 200));
    return {};
  }

  // Validate: only accept known month strings
  const result = {};
  for (const [name, months] of Object.entries(parsed)) {
    if (!Array.isArray(months)) continue;
    const valid = months.filter((m) => VALID_MONTHS.includes(m));
    result[name] = valid;
  }
  return result;
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  // Fetch plants with empty pruning_months
  const { data: plants, error } = await supabase
    .from("plant_species")
    .select("id, scientific_name, common_name_en")
    .eq("pruning_months", "{}");

  if (error) { console.error("Failed to fetch plants:", error.message); process.exit(1); }

  console.log(`Plants with empty pruning_months: ${plants.length}`);
  if (plants.length === 0) { console.log("Nothing to do."); return; }

  let updated = 0;
  let skipped = 0; // Claude returned [] (no pruning needed)
  let errors = 0;

  // Process in batches
  for (let i = 0; i < plants.length; i += BATCH_SIZE) {
    const batch = plants.slice(i, i + BATCH_SIZE);
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(plants.length / BATCH_SIZE);
    process.stdout.write(`Batch ${batchNum}/${totalBatches} (${batch.length} plants)… `);

    let pruningMap;
    try {
      pruningMap = await askClaudeForPruningMonths(batch);
    } catch (e) {
      console.error(`\n  Claude request failed: ${e.message}`);
      errors += batch.length;
      continue;
    }

    process.stdout.write("done\n");

    // Apply results
    for (const plant of batch) {
      const months = pruningMap[plant.scientific_name];

      if (!months) {
        // Claude didn't return this plant (parse error or missing key)
        console.log(`  ? ${plant.scientific_name} — not in response, skipping`);
        errors++;
        continue;
      }

      if (months.length === 0) {
        // No pruning needed — leave as empty array (already is), just count
        skipped++;
        continue;
      }

      const monthStr = months.join(", ");
      console.log(`  ${plant.common_name_en ?? plant.scientific_name} → [${monthStr}]`);

      if (!DRY_RUN) {
        const { error: updateError } = await supabase
          .from("plant_species")
          .update({ pruning_months: months })
          .eq("id", plant.id);

        if (updateError) {
          console.error(`    ✗ Update failed: ${updateError.message}`);
          errors++;
          continue;
        }
      }

      updated++;
    }

    if (i + BATCH_SIZE < plants.length) {
      await sleep(DELAY_MS);
    }
  }

  console.log(`\n── Summary ──────────────────────`);
  console.log(`Updated with pruning months: ${updated}`);
  console.log(`No pruning needed (left []):  ${skipped}`);
  console.log(`Errors:                       ${errors}`);
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
      `\nPruning coverage: ${withPruning}/${total} (${Math.round(((withPruning ?? 0) / (total ?? 1)) * 100)}%)`,
    );
  }
}

main().catch((e) => {
  console.error("Fatal:", e);
  process.exit(1);
});
