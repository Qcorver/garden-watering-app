/**
 * fill-image-urls.mjs
 *
 * Fills in empty image_url for plants in the plant_species table
 * by querying the Wikipedia REST API (which serves Wikimedia Commons
 * thumbnails). Images are CC-licensed — attribution stored in the DB
 * but need not be displayed in the UI.
 *
 * Usage:
 *   SUPABASE_SERVICE_ROLE_KEY=sb_secret_... \
 *     node scripts/fill-image-urls.mjs
 *
 * Options:
 *   DRY_RUN=1        — print URLs without writing to DB
 *   DELAY_MS=300     — ms between Wikipedia requests (default 300)
 *   THUMB_WIDTH=400  — thumbnail width in px (default 400)
 */

import { createClient } from "@supabase/supabase-js";

// ── Config ────────────────────────────────────────────────────────────────────

const SUPABASE_URL = "https://hrnbrljlvmqmbdnagpsp.supabase.co";
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const DRY_RUN = process.env.DRY_RUN === "1";
const DELAY_MS = parseInt(process.env.DELAY_MS ?? "300", 10);
const THUMB_WIDTH = parseInt(process.env.THUMB_WIDTH ?? "400", 10);

if (!SERVICE_KEY) { console.error("Missing SUPABASE_SERVICE_ROLE_KEY"); process.exit(1); }
if (DRY_RUN) console.log("DRY RUN — no DB writes\n");

const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

// ── Helpers ───────────────────────────────────────────────────────────────────

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Fetch a thumbnail URL from the Wikipedia REST API for a given scientific name.
 * Returns the URL string, or null if not found.
 *
 * Uses the /page/summary/{title} endpoint which returns `thumbnail.source`
 * (a resized Wikimedia Commons image) when available.
 */
async function fetchWikipediaThumb(scientificName) {
  // Wikipedia titles use underscores and are case-sensitive for the first letter
  const title = encodeURIComponent(scientificName.replace(/ /g, "_"));
  const url = `https://en.wikipedia.org/api/rest_v1/page/summary/${title}`;

  const res = await fetch(url, {
    headers: {
      "User-Agent": "garden-watering-app/1.0 (image seeding script; contact: admin@example.com)",
      Accept: "application/json",
    },
  });

  if (res.status === 404) return null;
  if (!res.ok) {
    throw new Error(`Wikipedia API returned ${res.status} for "${scientificName}"`);
  }

  const data = await res.json();

  // Prefer `originalimage` for the full-res URL, resize on the fly via thumb URL
  const thumb = data.thumbnail;
  if (!thumb?.source) return null;

  // The thumbnail URL contains a size like /400px-. Replace it with our target width.
  const resized = thumb.source.replace(/\/\d+px-/, `/${THUMB_WIDTH}px-`);
  return resized;
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  // Fetch plants with empty or null image_url
  const { data: plants, error } = await supabase
    .from("plant_species")
    .select("id, scientific_name, common_name_en")
    .or("image_url.is.null,image_url.eq.");

  if (error) { console.error("Failed to fetch plants:", error.message); process.exit(1); }

  console.log(`Plants with empty image_url: ${plants.length}`);
  if (plants.length === 0) { console.log("Nothing to do."); return; }

  let updated = 0;
  let notFound = 0;
  let errors = 0;

  for (let i = 0; i < plants.length; i++) {
    const plant = plants[i];
    const label = plant.common_name_en ?? plant.scientific_name;
    process.stdout.write(`[${i + 1}/${plants.length}] ${label}… `);

    let thumbUrl;
    let usedFallback = false;
    try {
      thumbUrl = await fetchWikipediaThumb(plant.scientific_name);

      // Fallback: strip cultivar suffix and try just "Genus species" (first 2 words)
      if (!thumbUrl) {
        const parts = plant.scientific_name.trim().split(/\s+/);
        if (parts.length > 2) {
          const baseSpecies = parts.slice(0, 2).join(" ");
          await sleep(DELAY_MS);
          thumbUrl = await fetchWikipediaThumb(baseSpecies);
          if (thumbUrl) usedFallback = true;
        }
      }
    } catch (e) {
      console.log(`ERROR: ${e.message}`);
      errors++;
      await sleep(DELAY_MS);
      continue;
    }

    if (!thumbUrl) {
      console.log("not found");
      notFound++;
      await sleep(DELAY_MS);
      continue;
    }

    console.log(`${usedFallback ? "(species fallback) " : ""}${thumbUrl}`);

    if (!DRY_RUN) {
      const { error: updateError } = await supabase
        .from("plant_species")
        .update({ image_url: thumbUrl })
        .eq("id", plant.id);

      if (updateError) {
        console.error(`  ✗ Update failed: ${updateError.message}`);
        errors++;
        await sleep(DELAY_MS);
        continue;
      }
    }

    updated++;
    await sleep(DELAY_MS);
  }

  console.log(`\n── Summary ──────────────────────`);
  console.log(`Updated with image URL: ${updated}`);
  console.log(`Not found on Wikipedia: ${notFound}`);
  console.log(`Errors:                 ${errors}`);
  if (DRY_RUN) console.log("(DRY RUN — nothing written)");

  if (!DRY_RUN) {
    const { count: total } = await supabase
      .from("plant_species")
      .select("*", { count: "exact", head: true });
    const { count: withImage } = await supabase
      .from("plant_species")
      .select("*", { count: "exact", head: true })
      .not("image_url", "is", null)
      .neq("image_url", "");
    console.log(
      `\nImage coverage: ${withImage}/${total} (${Math.round(((withImage ?? 0) / (total ?? 1)) * 100)}%)`,
    );
  }
}

main().catch((e) => {
  console.error("Fatal:", e);
  process.exit(1);
});
