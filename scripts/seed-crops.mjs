/**
 * seed-crops.mjs
 *
 * Seeds the crop_species table with a curated list of common Dutch
 * vegetable-garden crops (groenten, kruiden, klein fruit). Data is embedded
 * here (not Claude-generated) so it is reviewable and reproducible.
 * Upserts on name_nl, so the script is safe to re-run after edits.
 *
 * Usage:
 *   SUPABASE_SERVICE_ROLE_KEY=eyJ... node scripts/seed-crops.mjs
 *
 * Options:
 *   DRY_RUN=1 — print rows without writing to DB
 */

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://hrnbrljlvmqmbdnagpsp.supabase.co";
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const DRY_RUN = process.env.DRY_RUN === "1";

if (!SERVICE_KEY && !DRY_RUN) { console.error("Missing SUPABASE_SERVICE_ROLE_KEY"); process.exit(1); }
if (DRY_RUN) console.log("DRY RUN — no DB writes\n");

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const IDX = Object.fromEntries(MONTHS.map((m, i) => [m.slice(0, 3), i]));

// Inclusive month range with wraparound: mr("Sep", "Mar") → Sep..Dec + Jan..Mar
function mr(from, to) {
  const a = IDX[from], b = IDX[to];
  const out = [];
  for (let i = a; ; i = (i + 1) % 12) {
    out.push(MONTHS[i]);
    if (i === b) break;
  }
  return out;
}

// Crop entry shape:
//   [name_nl, name_en, scientific_name, category, emoji,
//    sow_indoor, sow_outdoor, plant_out, harvest,
//    [germinateMin, germinateMax], [harvestMin, harvestMax]]
// Months are NL outdoor growing calendar (zone 8, temperate maritime).
// harvestMin/Max = days from sowing (or planting when not grown from seed);
// null = not applicable (perennials, bought as plant).
const CROPS = [
  // ── Groenten ──────────────────────────────────────────────────────────────
  ["Radijs", "Radish", "Raphanus sativus", "groente", "🌱", [], mr("Mar", "Sep"), [], mr("Apr", "Oct"), [5, 10], [25, 40]],
  ["Kropsla", "Lettuce", "Lactuca sativa", "groente", "🥬", mr("Feb", "Mar"), mr("Apr", "Aug"), mr("Apr", "Aug"), mr("May", "Oct"), [6, 12], [50, 70]],
  ["Snijsla", "Cut lettuce", "Lactuca sativa", "groente", "🥬", [], mr("Mar", "Sep"), [], mr("Apr", "Oct"), [6, 12], [30, 45]],
  ["Tomaat", "Tomato", "Solanum lycopersicum", "groente", "🍅", mr("Feb", "Apr"), [], mr("May", "Jun"), mr("Jul", "Oct"), [7, 14], [100, 140]],
  ["Komkommer", "Cucumber", "Cucumis sativus", "groente", "🥒", mr("Apr", "May"), ["May"], mr("May", "Jun"), mr("Jul", "Sep"), [5, 10], [70, 90]],
  ["Courgette", "Zucchini", "Cucurbita pepo", "groente", "🥒", mr("Apr", "May"), mr("May", "Jun"), mr("May", "Jun"), mr("Jul", "Oct"), [6, 10], [55, 70]],
  ["Pompoen", "Pumpkin", "Cucurbita maxima", "groente", "🎃", mr("Apr", "May"), ["May"], mr("May", "Jun"), mr("Sep", "Oct"), [6, 10], [100, 120]],
  ["Paprika", "Bell pepper", "Capsicum annuum", "groente", "🫑", mr("Feb", "Mar"), [], mr("May", "Jun"), mr("Jul", "Oct"), [10, 21], [130, 160]],
  ["Spaanse peper", "Chili pepper", "Capsicum annuum", "groente", "🌶️", mr("Feb", "Mar"), [], mr("May", "Jun"), mr("Jul", "Oct"), [10, 21], [120, 150]],
  ["Aubergine", "Eggplant", "Solanum melongena", "groente", "🍆", mr("Feb", "Mar"), [], mr("May", "Jun"), mr("Aug", "Oct"), [10, 21], [130, 160]],
  ["Wortel", "Carrot", "Daucus carota", "groente", "🥕", [], mr("Mar", "Jul"), [], mr("Jun", "Nov"), [10, 20], [70, 110]],
  ["Rode biet", "Beetroot", "Beta vulgaris", "groente", "🌱", [], mr("Apr", "Jul"), [], mr("Jun", "Oct"), [7, 14], [60, 90]],
  ["Pastinaak", "Parsnip", "Pastinaca sativa", "groente", "🥕", [], mr("Mar", "May"), [], mr("Oct", "Feb"), [14, 28], [120, 180]],
  ["Meiraap", "Turnip", "Brassica rapa subsp. rapa", "groente", "🌱", [], mr("Mar", "Aug"), [], mr("May", "Oct"), [5, 10], [50, 70]],
  ["Ui", "Onion", "Allium cepa", "groente", "🧅", [], mr("Mar", "Apr"), [], mr("Jul", "Sep"), [10, 14], [150, 180]],
  ["Sjalot", "Shallot", "Allium cepa var. aggregatum", "groente", "🧅", [], mr("Feb", "Apr"), [], mr("Jul", "Aug"), [10, 14], [150, 180]],
  ["Knoflook", "Garlic", "Allium sativum", "groente", "🧄", [], mr("Oct", "Nov").concat(mr("Feb", "Mar")), [], mr("Jun", "Aug"), [14, 28], [240, 270]],
  ["Prei", "Leek", "Allium porrum", "groente", "🧅", mr("Feb", "Mar"), mr("Mar", "Apr"), mr("May", "Jun"), mr("Sep", "Mar"), [14, 21], [150, 200]],
  ["Bosui", "Spring onion", "Allium fistulosum", "groente", "🧅", [], mr("Mar", "Jul"), [], mr("May", "Oct"), [10, 14], [60, 80]],
  ["Sperzieboon", "Bush bean", "Phaseolus vulgaris", "groente", "🫘", [], mr("May", "Jul"), [], mr("Jul", "Oct"), [7, 14], [60, 75]],
  ["Stokboon", "Pole bean", "Phaseolus vulgaris", "groente", "🫘", [], mr("May", "Jun"), [], mr("Jul", "Oct"), [7, 14], [70, 90]],
  ["Tuinboon", "Broad bean", "Vicia faba", "groente", "🫘", [], mr("Feb", "Apr"), [], mr("Jun", "Jul"), [10, 14], [90, 120]],
  ["Doperwt", "Pea", "Pisum sativum", "groente", "🫛", [], mr("Mar", "May"), [], mr("Jun", "Aug"), [7, 14], [80, 100]],
  ["Peultjes", "Snow pea", "Pisum sativum var. saccharatum", "groente", "🫛", [], mr("Mar", "May"), [], mr("Jun", "Aug"), [7, 14], [75, 95]],
  ["Spinazie", "Spinach", "Spinacia oleracea", "groente", "🥬", [], mr("Mar", "May").concat(mr("Aug", "Sep")), [], mr("Apr", "Jun").concat(mr("Sep", "Nov")), [7, 14], [40, 60]],
  ["Veldsla", "Corn salad", "Valerianella locusta", "groente", "🥬", [], mr("Aug", "Oct"), [], mr("Oct", "Mar"), [10, 14], [60, 90]],
  ["Rucola", "Arugula", "Eruca vesicaria", "groente", "🥬", [], mr("Mar", "Sep"), [], mr("Apr", "Oct"), [5, 8], [30, 45]],
  ["Postelein", "Purslane", "Portulaca oleracea", "groente", "🥬", [], mr("May", "Aug"), [], mr("Jun", "Sep"), [7, 10], [30, 40]],
  ["Snijbiet", "Swiss chard", "Beta vulgaris subsp. cicla", "groente", "🥬", [], mr("Apr", "Jul"), [], mr("Jun", "Nov"), [7, 14], [55, 65]],
  ["Andijvie", "Endive", "Cichorium endivia", "groente", "🥬", mr("Apr", "Jun"), mr("May", "Jul"), mr("May", "Aug"), mr("Jun", "Nov"), [5, 10], [80, 100]],
  ["Boerenkool", "Kale", "Brassica oleracea var. sabellica", "groente", "🥬", [], mr("May", "Jun"), mr("Jun", "Jul"), mr("Oct", "Feb"), [5, 10], [110, 150]],
  ["Broccoli", "Broccoli", "Brassica oleracea var. italica", "groente", "🥦", mr("Mar", "Apr"), mr("Apr", "Jun"), mr("May", "Jul"), mr("Jun", "Oct"), [5, 10], [90, 110]],
  ["Bloemkool", "Cauliflower", "Brassica oleracea var. botrytis", "groente", "🥦", mr("Feb", "Apr"), [], mr("Apr", "Jun"), mr("Jun", "Oct"), [5, 10], [100, 130]],
  ["Spruitjes", "Brussels sprouts", "Brassica oleracea var. gemmifera", "groente", "🥬", mr("Mar", "Apr"), [], mr("May", "Jun"), mr("Oct", "Feb"), [5, 10], [180, 210]],
  ["Rode kool", "Red cabbage", "Brassica oleracea var. capitata f. rubra", "groente", "🥬", mr("Mar", "Apr"), [], mr("May", "Jun"), mr("Aug", "Nov"), [5, 10], [120, 150]],
  ["Witte kool", "White cabbage", "Brassica oleracea var. capitata", "groente", "🥬", mr("Mar", "Apr"), [], mr("May", "Jun"), mr("Aug", "Nov"), [5, 10], [120, 150]],
  ["Chinese kool", "Napa cabbage", "Brassica rapa subsp. pekinensis", "groente", "🥬", [], mr("Jun", "Jul"), [], mr("Sep", "Nov"), [4, 8], [70, 90]],
  ["Paksoi", "Bok choy", "Brassica rapa subsp. chinensis", "groente", "🥬", mr("Apr", "Jul"), mr("May", "Aug"), mr("May", "Aug"), mr("Jun", "Oct"), [4, 8], [45, 60]],
  ["Koolrabi", "Kohlrabi", "Brassica oleracea var. gongylodes", "groente", "🥬", ["Mar"], mr("Apr", "Jun"), mr("Apr", "Jun"), mr("May", "Oct"), [5, 10], [55, 70]],
  ["Knolvenkel", "Florence fennel", "Foeniculum vulgare var. azoricum", "groente", "🌿", ["Apr"], mr("May", "Jul"), mr("May", "Jul"), mr("Jul", "Oct"), [7, 14], [80, 100]],
  ["Knolselderij", "Celeriac", "Apium graveolens var. rapaceum", "groente", "🌱", mr("Feb", "Mar"), [], ["May"], mr("Oct", "Nov"), [14, 21], [190, 220]],
  ["Bleekselderij", "Celery", "Apium graveolens", "groente", "🥬", ["Mar"], [], mr("May", "Jun"), mr("Aug", "Oct"), [14, 21], [140, 170]],
  ["Aardappel", "Potato", "Solanum tuberosum", "groente", "🥔", [], mr("Mar", "Apr"), [], mr("Jun", "Sep"), [14, 28], [90, 120]],
  ["Suikermais", "Sweet corn", "Zea mays", "groente", "🌽", ["Apr"], ["May"], mr("May", "Jun"), mr("Aug", "Sep"), [6, 10], [100, 120]],
  ["Rabarber", "Rhubarb", "Rheum rhabarbarum", "groente", "🌱", [], [], mr("Mar", "Apr").concat(mr("Oct", "Nov")), mr("Apr", "Jun"), null, null],

  // ── Kruiden ───────────────────────────────────────────────────────────────
  ["Basilicum", "Basil", "Ocimum basilicum", "kruid", "🌿", mr("Mar", "May"), [], mr("May", "Jun"), mr("Jun", "Oct"), [5, 10], [60, 80]],
  ["Peterselie", "Parsley", "Petroselinum crispum", "kruid", "🌿", mr("Feb", "Apr"), mr("Apr", "Jul"), mr("Apr", "Jul"), mr("May", "Nov"), [21, 30], [70, 90]],
  ["Bieslook", "Chives", "Allium schoenoprasum", "kruid", "🌿", [], mr("Mar", "Jun"), [], mr("Apr", "Oct"), [10, 14], [60, 80]],
  ["Koriander", "Coriander", "Coriandrum sativum", "kruid", "🌿", [], mr("Apr", "Jul"), [], mr("May", "Oct"), [7, 14], [40, 60]],
  ["Dille", "Dill", "Anethum graveolens", "kruid", "🌿", [], mr("Apr", "Jul"), [], mr("Jun", "Sep"), [10, 14], [40, 60]],
  ["Munt", "Mint", "Mentha spicata", "kruid", "🌿", [], [], mr("Apr", "Jun"), mr("May", "Oct"), null, null],
  ["Rozemarijn", "Rosemary", "Salvia rosmarinus", "kruid", "🌿", [], [], mr("Apr", "Jun"), mr("Jan", "Dec"), null, null],
  ["Tijm", "Thyme", "Thymus vulgaris", "kruid", "🌿", mr("Mar", "Apr"), [], mr("Apr", "Jun"), mr("May", "Oct"), [14, 28], null],
  ["Salie", "Sage", "Salvia officinalis", "kruid", "🌿", [], [], mr("Apr", "Jun"), mr("May", "Oct"), null, null],
  ["Oregano", "Oregano", "Origanum vulgare", "kruid", "🌿", mr("Mar", "Apr"), [], mr("Apr", "Jun"), mr("Jun", "Sep"), [10, 21], null],

  // ── Fruit ─────────────────────────────────────────────────────────────────
  ["Aardbei", "Strawberry", "Fragaria × ananassa", "fruit", "🍓", [], [], mr("Mar", "Apr").concat(mr("Aug", "Sep")), mr("Jun", "Aug"), null, null],
  ["Framboos", "Raspberry", "Rubus idaeus", "fruit", "🍇", [], [], mr("Oct", "Mar"), mr("Jul", "Oct"), null, null],
  ["Braam", "Blackberry", "Rubus fruticosus", "fruit", "🫐", [], [], mr("Oct", "Mar"), mr("Aug", "Sep"), null, null],
  ["Blauwe bes", "Blueberry", "Vaccinium corymbosum", "fruit", "🫐", [], [], mr("Oct", "Apr"), mr("Jul", "Sep"), null, null],
  ["Rode bes", "Redcurrant", "Ribes rubrum", "fruit", "🍒", [], [], mr("Oct", "Mar"), mr("Jun", "Aug"), null, null],
];

function toRow([nl, en, sci, cat, emoji, si, so, po, h, germ, harv]) {
  return {
    name_nl: nl,
    name_en: en,
    scientific_name: sci,
    category: cat,
    emoji,
    sow_indoor_months: si,
    sow_outdoor_months: so,
    plant_out_months: po,
    harvest_months: h,
    days_to_germinate_min: germ?.[0] ?? null,
    days_to_germinate_max: germ?.[1] ?? null,
    days_to_harvest_min: harv?.[0] ?? null,
    days_to_harvest_max: harv?.[1] ?? null,
  };
}

async function main() {
  const rows = CROPS.map(toRow);
  console.log(`Seeding ${rows.length} crops (${rows.filter((r) => r.category === "groente").length} groenten, ${rows.filter((r) => r.category === "kruid").length} kruiden, ${rows.filter((r) => r.category === "fruit").length} fruit)`);

  if (DRY_RUN) {
    for (const r of rows) {
      console.log(`  ${r.emoji} ${r.name_nl} — zaai binnen [${r.sow_indoor_months.join(",")}] buiten [${r.sow_outdoor_months.join(",")}] uitplanten [${r.plant_out_months.join(",")}] oogst [${r.harvest_months.join(",")}]`);
    }
    return;
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_KEY);
  const { error } = await supabase
    .from("crop_species")
    .upsert(rows, { onConflict: "name_nl" });

  if (error) { console.error("Upsert failed:", error.message); process.exit(1); }

  const { count } = await supabase
    .from("crop_species")
    .select("*", { count: "exact", head: true });
  console.log(`Done. crop_species now holds ${count} rows.`);
}

main().catch((e) => { console.error("Fatal:", e); process.exit(1); });
