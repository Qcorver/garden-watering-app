/**
 * patch-plant-images-inat.mjs
 *
 * Updates plant_species.image_url for all rows that have a missing, Perenual,
 * or Wikimedia image URL by fetching from the iNaturalist taxa API.
 * iNaturalist images are served from AWS S3 and work reliably in Capacitor.
 *
 * Usage:
 *   SUPABASE_SERVICE_ROLE_KEY=eyJ... node scripts/patch-plant-images-inat.mjs
 *
 * Options:
 *   ALL=1   — also replace rows that already have a working (non-wikimedia) image_url
 *   DRY=1   — print what would be updated without writing to DB
 */

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://hrnbrljlvmqmbdnagpsp.supabase.co";
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const PATCH_ALL = process.env.ALL === "1";
const DRY_RUN = process.env.DRY === "1";
const DELAY_MS = 500; // between iNaturalist requests (be a good API citizen)

if (!SERVICE_KEY) {
  console.error("Missing SUPABASE_SERVICE_ROLE_KEY env var");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function needsUpdate(imageUrl) {
  if (!imageUrl) return true;
  if (imageUrl.includes("perenual.com")) return true;
  if (imageUrl.includes("wikimedia.org")) return true;
  return false;
}

async function fetchINatImage(scientificName) {
  // Build a list of names to try: full name first, then progressively shorter
  // e.g. "Acer palmatum 'Bloodgood'" → ["Acer palmatum 'Bloodgood'", "Acer palmatum", "Acer"]
  const names = [scientificName];
  // Strip cultivar (anything after and including a quote or 'var.' / 'subsp.')
  const baseSpecies = scientificName.replace(/\s*['''"].+$/, "").replace(/\s+(var\.|subsp\.|f\.|x\s+\S+\s+'.*')\s*.*$/, "").trim();
  if (baseSpecies !== scientificName) names.push(baseSpecies);
  // Also try just genus+species (first two words)
  const genusSpecies = baseSpecies.split(/\s+/).slice(0, 2).join(" ");
  if (genusSpecies !== baseSpecies && genusSpecies.includes(" ")) names.push(genusSpecies);

  for (const name of names) {
    const url = `https://api.inaturalist.org/v1/taxa?q=${encodeURIComponent(name)}&per_page=1&locale=en`;
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": "garden-watering-app/1.0 (plant-image-patch)" },
      });
      if (!res.ok) continue;
      const data = await res.json();
      const photo = data?.results?.[0]?.default_photo;
      const imgUrl = photo?.medium_url ?? photo?.square_url ?? null;
      if (imgUrl) return imgUrl;
    } catch {
      // try next name
    }
    await sleep(200); // small delay between fallback attempts
  }
  return null;
}

async function main() {
  const { data: plants, error } = await supabase
    .from("plant_species")
    .select("id, scientific_name, common_name_en, image_url")
    .order("id", { ascending: true });

  if (error) {
    console.error("Failed to fetch plants:", error.message);
    process.exit(1);
  }

  const toProcess = PATCH_ALL ? plants : plants.filter((p) => needsUpdate(p.image_url));

  console.log(
    `${plants.length} plants in DB, ${toProcess.length} need updating (PATCH_ALL=${PATCH_ALL}, DRY=${DRY_RUN})`
  );

  let updated = 0;
  let notFound = 0;
  let errors = 0;

  for (const plant of toProcess) {
    const inatUrl = await fetchINatImage(plant.scientific_name);
    await sleep(DELAY_MS);

    if (!inatUrl) {
      console.log(`  ✗ ${plant.scientific_name} — no iNat image`);
      notFound++;
      continue;
    }

    if (DRY_RUN) {
      console.log(`  [dry] ${plant.scientific_name} → ${inatUrl}`);
      updated++;
      continue;
    }

    const { error: upErr } = await supabase
      .from("plant_species")
      .update({ image_url: inatUrl })
      .eq("id", plant.id);

    if (upErr) {
      console.error(`  ! ${plant.scientific_name} — update failed: ${upErr.message}`);
      errors++;
    } else {
      console.log(`  ✓ ${plant.scientific_name}`);
      updated++;
    }
  }

  console.log(`\nDone. Updated: ${updated}, not found: ${notFound}, errors: ${errors}`);
}

main();
