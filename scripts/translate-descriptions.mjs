/**
 * translate-descriptions.mjs
 *
 * Generates Dutch (and English) plant descriptions via Claude Haiku for all
 * plants in plant_species that have no description_nl yet.
 * Uses the plant's scientific name, common names, and pruning months as input.
 *
 * Usage:
 *   ANTHROPIC_API_KEY=sk-ant-... SUPABASE_SERVICE_ROLE_KEY=eyJ... node scripts/translate-descriptions.mjs
 *
 * Options (env vars):
 *   DRY_RUN=1        — Print generated text without writing to DB
 *   BATCH_SIZE=15    — Plants per Claude API call (default: 15)
 */

import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";

// ── Config ────────────────────────────────────────────────────────────────────

const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
const SUPABASE_URL = "https://hrnbrljlvmqmbdnagpsp.supabase.co";
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const DRY_RUN = process.env.DRY_RUN === "1";
const BATCH_SIZE = parseInt(process.env.BATCH_SIZE ?? "15", 10);

if (!ANTHROPIC_KEY) {
  console.error("Missing ANTHROPIC_API_KEY env var.");
  process.exit(1);
}
if (!SERVICE_KEY) {
  console.error("Missing SUPABASE_SERVICE_ROLE_KEY env var");
  process.exit(1);
}

const anthropic = new Anthropic({ apiKey: ANTHROPIC_KEY });
const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

// ── Helpers ───────────────────────────────────────────────────────────────────

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Ask Claude to generate Dutch (and English) plant descriptions for a batch
 * of plants. Returns an array of { description, description_nl } objects.
 */
async function generateDescriptions(plants) {
  const plantList = plants.map((p, i) => {
    const parts = [`${i + 1}. Scientific name: ${p.scientific_name}`];
    if (p.common_name_en) parts.push(`English name: ${p.common_name_en}`);
    if (p.common_name_nl) parts.push(`Dutch name: ${p.common_name_nl}`);
    if (p.pruning_months?.length) parts.push(`Pruning months: ${p.pruning_months.join(", ")}`);
    return parts.join(" | ");
  }).join("\n");

  const message = await anthropic.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 4096,
    system:
      "You are a botanical expert writing concise plant descriptions for a garden app. " +
      "Write 2–3 informative sentences per plant, suitable for home gardeners. " +
      "Mention what type of plant it is, notable characteristics, and garden use. " +
      "If pruning months are provided, include a brief pruning tip. " +
      "Return ONLY a JSON array of objects. Each object must have exactly two keys: " +
      "\"description\" (English) and \"description_nl\" (Dutch). " +
      "No markdown, no explanation — just the raw JSON array.",
    messages: [
      {
        role: "user",
        content:
          `Generate descriptions for these ${plants.length} plants. ` +
          `Return a JSON array with exactly ${plants.length} objects, each with "description" and "description_nl":\n\n${plantList}`,
      },
    ],
  });

  const raw = message.content[0].text.trim();
  const json = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();

  let parsed;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new Error(`Claude returned non-JSON: ${raw.slice(0, 300)}`);
  }

  if (!Array.isArray(parsed) || parsed.length !== plants.length) {
    throw new Error(
      `Expected array of ${plants.length} objects, got ${Array.isArray(parsed) ? parsed.length : typeof parsed}`
    );
  }

  return parsed.map((item) => ({
    description: String(item.description ?? "").trim() || null,
    description_nl: String(item.description_nl ?? "").trim() || null,
  }));
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  if (DRY_RUN) console.log("DRY RUN — no changes will be written to DB\n");

  const { data: plants, error } = await supabase
    .from("plant_species")
    .select("id, scientific_name, common_name_en, common_name_nl, pruning_months")
    .is("description_nl", null)
    .order("id");

  if (error) {
    console.error("DB fetch failed:", error.message);
    process.exit(1);
  }

  if (!plants || plants.length === 0) {
    console.log("All plants already have a Dutch description. Nothing to do.");
    return;
  }

  console.log(`Plants to describe: ${plants.length}\n`);

  let done = 0;
  let errors = 0;
  const totalBatches = Math.ceil(plants.length / BATCH_SIZE);

  for (let i = 0; i < plants.length; i += BATCH_SIZE) {
    const batch = plants.slice(i, i + BATCH_SIZE);
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;

    process.stdout.write(
      `Batch ${batchNum}/${totalBatches} (${i + 1}–${Math.min(i + BATCH_SIZE, plants.length)})… `
    );

    let results;
    try {
      results = await generateDescriptions(batch);
    } catch (e) {
      console.error(`FAILED: ${e.message}`);
      errors += batch.length;
      await sleep(3000);
      continue;
    }

    console.log("ok");

    for (let j = 0; j < batch.length; j++) {
      const plant = batch[j];
      const { description, description_nl } = results[j];

      if (DRY_RUN) {
        console.log(`  ${plant.common_name_en ?? plant.scientific_name}`);
        console.log(`    EN: ${description?.slice(0, 90)}…`);
        console.log(`    NL: ${description_nl?.slice(0, 90)}…`);
        done++;
        continue;
      }

      const { error: updateErr } = await supabase
        .from("plant_species")
        .update({ description, description_nl })
        .eq("id", plant.id);

      if (updateErr) {
        console.error(`  ✗ ${plant.common_name_en ?? plant.scientific_name}: ${updateErr.message}`);
        errors++;
      } else {
        done++;
      }
    }

    if (i + BATCH_SIZE < plants.length) await sleep(500);
  }

  console.log(`\nDone. Generated: ${done}, Errors: ${errors}`);

  if (!DRY_RUN) {
    const { count } = await supabase
      .from("plant_species")
      .select("*", { count: "exact", head: true })
      .not("description_nl", "is", null);
    console.log(`Dutch description coverage: ${count}/${plants.length + done} plants`);
  }
}

main().catch((e) => {
  console.error("Fatal:", e);
  process.exit(1);
});
