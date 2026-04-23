/**
 * patch-pruning-months.mjs
 *
 * Re-fetches pruning_month (and sunlight) from Perenual for all plants in the
 * plant_species table that currently have empty arrays.
 *
 * Usage:
 *   PERENUAL_API_KEY=sk-... SUPABASE_SERVICE_ROLE_KEY=eyJ... node scripts/patch-pruning-months.mjs
 *
 * Options (env vars):
 *   DRY_RUN=1          — print what would be updated without writing to DB
 *   DELAY_MS=500       — ms between Perenual API calls (default 1200)
 *   MAX_REQUESTS=80    — stop after N API calls (to stay within daily quota)
 */

import { createClient } from "@supabase/supabase-js";

// ── Config ────────────────────────────────────────────────────────────────────

const PERENUAL_KEY = process.env.PERENUAL_API_KEY;
const SUPABASE_URL = "https://hrnbrljlvmqmbdnagpsp.supabase.co";
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const DRY_RUN = process.env.DRY_RUN === "1";
const DELAY_MS = parseInt(process.env.DELAY_MS ?? "1200", 10);
// Only patch plants with perenual_id >= MIN_ID (skip known no-data ranges)
const MIN_ID = parseInt(process.env.MIN_ID ?? "0", 10);
const MAX_ID = parseInt(process.env.MAX_ID ?? "999999", 10);
// Stop after this many Perenual API calls to stay within the daily quota
const MAX_REQUESTS = parseInt(process.env.MAX_REQUESTS ?? "999999", 10);

if (!PERENUAL_KEY) {
  console.error("Missing PERENUAL_API_KEY env var");
  process.exit(1);
}
if (!SERVICE_KEY) {
  console.error("Missing SUPABASE_SERVICE_ROLE_KEY env var");
  process.exit(1);
}

if (DRY_RUN) console.log("DRY RUN — no DB writes will happen\n");

const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function perenualGet(path) {
  const url = `https://perenual.com/api/${path}&key=${PERENUAL_KEY}`;
  const res = await fetch(url);
  if (res.status === 429) throw new Error("Rate limited (429)");
  if (!res.ok) throw new Error(`Perenual ${path} → ${res.status}`);
  return res.json();
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  // Load all plants with empty pruning_months OR empty sunlight OR missing image/description
  const { data: plants, error } = await supabase
    .from("plant_species")
    .select("id, perenual_id, scientific_name, common_name_en, pruning_months, sunlight, image_url, description")
    .order("id");

  if (error) {
    console.error("Failed to load plants:", error.message);
    process.exit(1);
  }

  const targets = plants.filter(
    (p) =>
      p.perenual_id >= MIN_ID &&
      p.perenual_id <= MAX_ID &&
      ((!p.pruning_months || p.pruning_months.length === 0) ||
       (!p.sunlight || p.sunlight.length === 0) ||
       !p.image_url ||
       !p.description)
  );

  console.log(`Total plants: ${plants.length}`);
  console.log(`Plants with missing data (pruning/sunlight/image/description): ${targets.length}\n`);

  let updated = 0;
  let noData = 0;
  let errors = 0;
  let requests = 0;

  for (let i = 0; i < targets.length; i++) {
    if (requests >= MAX_REQUESTS) {
      const nextId = targets[i].perenual_id;
      console.log(`\n⚠️  MAX_REQUESTS (${MAX_REQUESTS}) reached. Resume tomorrow with MIN_ID=${nextId}`);
      break;
    }

    const plant = targets[i];
    process.stdout.write(
      `[${i + 1}/${targets.length}] ${plant.common_name_en} (perenual_id=${plant.perenual_id}) … `
    );

    await sleep(DELAY_MS);

    let details;
    try {
      details = await perenualGet(`species/details/${plant.perenual_id}?`);
      requests++;
    } catch (e) {
      console.log(`ERROR: ${e.message}`);
      errors++;
      if (e.message.includes("429")) {
        console.log("  Rate limited — waiting 60s before continuing…");
        await sleep(60000);
      }
      continue;
    }

    const pruningMonths = details?.pruning_month ?? [];
    const sunlight = details?.sunlight ?? [];
    const cycle = details?.cycle ?? plant.cycle ?? null;
    const maintenance = details?.maintenance ?? null;
    const imageUrl =
      details?.default_image?.medium_url ??
      details?.default_image?.thumbnail ??
      null;
    const description = details?.description ?? null;

    const hasPruning = pruningMonths.length > 0;
    const hasSunlight = sunlight.length > 0;
    const hasImage = !!imageUrl;
    const hasDescription = !!description;

    if (!hasPruning && !hasSunlight && !hasImage && !hasDescription) {
      console.log("no data");
      noData++;
      continue;
    }

    const tag = [
      hasPruning ? `pruning: ${pruningMonths.join(", ")}` : null,
      hasSunlight ? `sunlight: ${sunlight.join(", ")}` : null,
      hasImage ? "image ✓" : null,
      hasDescription ? "desc ✓" : null,
    ]
      .filter(Boolean)
      .join(" | ");

    console.log(tag);

    if (!DRY_RUN) {
      const patch = {};
      if (hasPruning) patch.pruning_months = pruningMonths;
      if (hasSunlight) patch.sunlight = sunlight;
      if (cycle) patch.cycle = cycle;
      if (maintenance) patch.maintenance = maintenance;
      if (hasImage && !plant.image_url) patch.image_url = imageUrl;
      if (hasDescription && !plant.description) patch.description = description;

      const { error: updateError } = await supabase
        .from("plant_species")
        .update(patch)
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
  console.log(`Updated:  ${updated}`);
  console.log(`No data:  ${noData}`);
  console.log(`Errors:   ${errors}`);
  if (DRY_RUN) console.log("(DRY RUN — nothing was written)");

  if (noData > 0) {
    console.log(`\nNote: ${noData} plants returned no data from Perenual.`);
    console.log(
      "This usually means the free API tier doesn't include pruning_month for these species."
    );
    console.log(
      "Consider adding manual pruning months via the app, or upgrading the Perenual API key."
    );
  }
}

main().catch((e) => {
  console.error("Fatal:", e);
  process.exit(1);
});
