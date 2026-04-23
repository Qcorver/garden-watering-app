/**
 * enrich-popularity-nl.mjs
 *
 * Uses the Claude API to rate how common each plant species is in Dutch gardens
 * (popularity_nl: 0–5), then writes the scores back to the plant_species table.
 *
 * The score drives search-result ordering in plant-proxy and the "Meest voorkomend"
 * badge in the app (shown for plants with popularity_nl >= 4).
 *
 * Usage:
 *   ANTHROPIC_API_KEY=sk-ant-... SUPABASE_SERVICE_ROLE_KEY=eyJ... node scripts/enrich-popularity-nl.mjs
 *
 * Options (env vars):
 *   BATCH_SIZE=50   Number of plants per Claude request (default 50)
 *   DRY_RUN=1       Print scores but don't write to DB
 *   FORCE=1         Re-score plants that already have a popularity_nl value
 */

import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";

// ── Config ────────────────────────────────────────────────────────────────────

const SUPABASE_URL = "https://hrnbrljlvmqmbdnagpsp.supabase.co";
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
const BATCH_SIZE = parseInt(process.env.BATCH_SIZE ?? "50", 10);
const DRY_RUN = process.env.DRY_RUN === "1";
const FORCE = process.env.FORCE === "1";

if (!SERVICE_KEY) {
  console.error("Missing SUPABASE_SERVICE_ROLE_KEY env var");
  process.exit(1);
}
if (!ANTHROPIC_KEY) {
  console.error("Missing ANTHROPIC_API_KEY env var");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY);
const anthropic = new Anthropic({ apiKey: ANTHROPIC_KEY });

// ── Step 1: ensure the column exists ─────────────────────────────────────────

async function ensureColumn() {
  // Use Supabase Management API to run SQL
  const token = SERVICE_KEY;
  const projectRef = "hrnbrljlvmqmbdnagpsp";

  const res = await fetch(
    `https://api.supabase.com/v1/projects/${projectRef}/database/query`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query: `
          ALTER TABLE plant_species
          ADD COLUMN IF NOT EXISTS popularity_nl SMALLINT DEFAULT 0;
        `,
      }),
    },
  );

  if (!res.ok) {
    const body = await res.text();
    console.warn("Column migration warning (may already exist):", body);
  } else {
    console.log("✓ Column popularity_nl ensured");
  }
}

// ── Step 2: fetch plants ──────────────────────────────────────────────────────

async function fetchPlants() {
  const query = supabase
    .from("plant_species")
    .select("id, scientific_name, common_name_en, common_name_nl")
    .order("id");

  if (!FORCE) {
    // Only fetch plants that haven't been scored yet (popularity_nl is NULL or 0)
    query.or("popularity_nl.is.null,popularity_nl.eq.0");
  }

  const { data, error } = await query;
  if (error) throw error;
  return data;
}

// ── Step 3: score a batch of plants via Claude ────────────────────────────────

const SYSTEM_PROMPT = `You are a Dutch gardening expert with deep knowledge of which plant species
are commonly grown in Dutch home gardens, public parks, and garden centers in the Netherlands.

You will receive a list of plant species and must rate each one on a scale of 0–5 for how
popular/common they are in Dutch gardens specifically:

5 = Very common — found in the majority of Dutch gardens (e.g. Hydrangea macrophylla, Rosa, Lavandula)
4 = Common — frequently seen in Dutch gardens and widely sold in Dutch garden centers
3 = Moderately common — present in many gardens, especially among enthusiasts
2 = Uncommon — occasionally seen, more of a specialty plant
1 = Rare — seldom found in Dutch gardens
0 = Unknown or not applicable (e.g. tropical plants, vegetables, indoor-only plants)

Respond ONLY with a JSON array of objects with exactly these fields:
  id: number (the plant's database id)
  popularity_nl: number (integer 0–5)

No explanation, no markdown, no extra keys — just the raw JSON array.`;

async function scoreBatch(plants) {
  const plantList = plants
    .map(
      (p) =>
        `- id:${p.id} | ${p.scientific_name}` +
        (p.common_name_nl ? ` | NL: ${p.common_name_nl}` : "") +
        (p.common_name_en ? ` | EN: ${p.common_name_en}` : ""),
    )
    .join("\n");

  const stream = anthropic.messages.stream({
    model: "claude-opus-4-6",
    max_tokens: 4096,
    thinking: { type: "adaptive" },
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: `Rate the popularity in Dutch gardens for these ${plants.length} plants:\n\n${plantList}`,
      },
    ],
  });

  const message = await stream.finalMessage();

  // Extract the text block (thinking blocks are separate)
  const textBlock = message.content.find((b) => b.type === "text");
  if (!textBlock) throw new Error("No text block in Claude response");

  // Strip any accidental markdown fences
  const raw = textBlock.text.trim().replace(/^```json?\n?/, "").replace(/\n?```$/, "");

  let scores;
  try {
    scores = JSON.parse(raw);
  } catch (e) {
    console.error("Failed to parse Claude response:", raw.slice(0, 500));
    throw e;
  }

  if (!Array.isArray(scores)) throw new Error("Claude returned non-array JSON");
  return scores;
}

// ── Step 4: write scores to DB ────────────────────────────────────────────────

async function writeScores(scores) {
  if (DRY_RUN) {
    console.log("DRY_RUN — scores that would be written:", scores);
    return;
  }

  for (const { id, popularity_nl } of scores) {
    const { error } = await supabase
      .from("plant_species")
      .update({ popularity_nl })
      .eq("id", id);

    if (error) {
      console.error(`Failed to update plant id=${id}:`, error.message);
    }
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`enrich-popularity-nl.mjs  [DRY_RUN=${DRY_RUN}, FORCE=${FORCE}]`);

  if (!DRY_RUN) {
    await ensureColumn();
  }

  const plants = await fetchPlants();
  console.log(`Fetched ${plants.length} plants to score`);

  if (plants.length === 0) {
    console.log("Nothing to do. Use FORCE=1 to re-score all plants.");
    return;
  }

  let processed = 0;

  for (let i = 0; i < plants.length; i += BATCH_SIZE) {
    const batch = plants.slice(i, i + BATCH_SIZE);
    console.log(
      `Scoring batch ${Math.floor(i / BATCH_SIZE) + 1} / ${Math.ceil(plants.length / BATCH_SIZE)} (${batch.length} plants)…`,
    );

    const scores = await scoreBatch(batch);

    // Validate that every plant in the batch got a score
    const scoredIds = new Set(scores.map((s) => s.id));
    const missing = batch.filter((p) => !scoredIds.has(p.id));
    if (missing.length > 0) {
      console.warn(
        `Warning: ${missing.length} plants missing from Claude response:`,
        missing.map((p) => p.id),
      );
    }

    await writeScores(scores);
    processed += scores.length;
    console.log(`  → ${scores.length} scores written (${processed} total)`);
  }

  console.log(`\nDone. ${processed} plants scored.`);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
