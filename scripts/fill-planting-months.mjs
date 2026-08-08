/**
 * fill-planting-months.mjs
 *
 * Fills in planting_months for all plants in plant_species that currently
 * have an empty array, using Claude as a horticultural knowledge encoder.
 *
 * Usage:
 *   SUPABASE_SERVICE_ROLE_KEY=eyJ... ANTHROPIC_API_KEY=sk-ant-... \
 *     node scripts/fill-planting-months.mjs
 *
 * Options:
 *   DRY_RUN=1      — print updates without writing to DB
 *   BATCH_SIZE=25  — plants per Claude request (default 25)
 *   DELAY_MS=500   — ms between Claude requests (default 500)
 */

import { createClient } from "@supabase/supabase-js";
import Anthropic from "@anthropic-ai/sdk";

const SUPABASE_URL = "https://hrnbrljlvmqmbdnagpsp.supabase.co";
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
const DRY_RUN = process.env.DRY_RUN === "1";
const BATCH_SIZE = parseInt(process.env.BATCH_SIZE ?? "25", 10);
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

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function askClaudeForPlantingMonths(plants) {
  const plantList = plants
    .map((p) => `- ${p.scientific_name}${p.common_name_en ? ` (${p.common_name_en})` : ""}`)
    .join("\n");

  const prompt = `You are a horticultural reference encoder for a Dutch garden app. For each plant below, return the best months to plant it outdoors in the Netherlands (Northern Hemisphere, temperate maritime climate, zone 8).

Rules:
- "Planting" means the primary planting window: when to put it in the ground from pot/bare root/seed/bulb
- Return ONLY valid month names: January, February, March, April, May, June, July, August, September, October, November, December
- For spring bulbs (tulip, narcis, crocus, etc.): planting is in autumn (September–November)
- For summer bulbs (dahlia, begonia, gladiolus): planting is spring (March–May)
- For bare-root shrubs/trees: typically autumn (October–November) or early spring (February–March)
- For container plants: typically spring (March–May) or autumn (September–October)
- For annuals/vegetables: typically spring after last frost (April–May)
- For perennials: typically spring (March–May) or autumn (September–October)
- Return an empty array [] only if the plant is genuinely not planted in Dutch gardens (tropical indoor-only, etc.)
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
  const cleaned = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();

  let parsed;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    console.error("  Failed to parse Claude response:", text.slice(0, 200));
    return {};
  }

  const result = {};
  for (const [name, months] of Object.entries(parsed)) {
    if (!Array.isArray(months)) continue;
    result[name] = months.filter((m) => VALID_MONTHS.includes(m));
  }
  return result;
}

async function main() {
  const { data: plants, error } = await supabase
    .from("plant_species")
    .select("id, scientific_name, common_name_en")
    .eq("planting_months", "{}");

  if (error) { console.error("Failed to fetch plants:", error.message); process.exit(1); }

  console.log(`Plants with empty planting_months: ${plants.length}`);
  if (plants.length === 0) { console.log("Nothing to do."); return; }

  let updated = 0;
  let skipped = 0;
  let errors = 0;

  for (let i = 0; i < plants.length; i += BATCH_SIZE) {
    const batch = plants.slice(i, i + BATCH_SIZE);
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(plants.length / BATCH_SIZE);
    process.stdout.write(`Batch ${batchNum}/${totalBatches} (${batch.length} plants)… `);

    let plantingMap;
    try {
      plantingMap = await askClaudeForPlantingMonths(batch);
    } catch (e) {
      console.error(`\n  Claude request failed: ${e.message}`);
      errors += batch.length;
      continue;
    }

    process.stdout.write("done\n");

    for (const plant of batch) {
      const months = plantingMap[plant.scientific_name];

      if (!months) {
        console.log(`  ? ${plant.scientific_name} — not in response`);
        errors++;
        continue;
      }

      if (months.length === 0) {
        skipped++;
        continue;
      }

      console.log(`  ${plant.common_name_en ?? plant.scientific_name} → [${months.join(", ")}]`);

      if (!DRY_RUN) {
        const { error: updateError } = await supabase
          .from("plant_species")
          .update({ planting_months: months })
          .eq("id", plant.id);

        if (updateError) {
          console.error(`    Update failed: ${updateError.message}`);
          errors++;
          continue;
        }
      }

      updated++;
    }

    if (i + BATCH_SIZE < plants.length) await sleep(DELAY_MS);
  }

  console.log(`\n── Summary ──────────────────────`);
  console.log(`Updated with planting months: ${updated}`);
  console.log(`Skipped (not planted in NL):  ${skipped}`);
  console.log(`Errors:                       ${errors}`);
  if (DRY_RUN) console.log("(DRY RUN — nothing written)");

  if (!DRY_RUN) {
    const { count: total } = await supabase
      .from("plant_species")
      .select("*", { count: "exact", head: true });
    const { count: withMonths } = await supabase
      .from("plant_species")
      .select("*", { count: "exact", head: true })
      .filter("planting_months", "not.eq", "{}");
    console.log(
      `\nPlanting months coverage: ${withMonths}/${total} (${Math.round(((withMonths ?? 0) / (total ?? 1)) * 100)}%)`,
    );
  }
}

main().catch((e) => { console.error("Fatal:", e); process.exit(1); });
