/**
 * seed-common-plants.mjs
 *
 * Directly inserts a curated list of common garden plants into the plant_species
 * table — no Perenual API calls needed. Uses high fake perenual_ids (100001+)
 * to avoid conflicts with real Perenual IDs.
 *
 * Usage:
 *   SUPABASE_SERVICE_ROLE_KEY=eyJ... node scripts/seed-common-plants.mjs
 *
 * Options:
 *   DRY_RUN=1   — print what would be inserted without writing to DB
 */

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://hrnbrljlvmqmbdnagpsp.supabase.co";
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const DRY_RUN = process.env.DRY_RUN === "1";

if (!SERVICE_KEY) {
  console.error("Missing SUPABASE_SERVICE_ROLE_KEY env var");
  process.exit(1);
}

if (DRY_RUN) console.log("DRY RUN — no DB writes will happen\n");

const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

// Pruning months use English full month names (Perenual convention)
// perenual_id: 100001–100200 reserved for manual entries

const PLANTS = [
  // ── Roses ────────────────────────────────────────────────────────────────
  {
    perenual_id: 100001,
    scientific_name: "Rosa",
    common_name_en: "Rose",
    common_name_nl: "Roos",
    pruning_months: ["February", "March", "August"],
    sunlight: ["full sun"],
    cycle: "Perennial",
    maintenance: "Moderate",
    description: "Deciduous and semi-evergreen shrubs known for their beautiful blooms. Prune in late winter/early spring before new growth starts, and deadhead through summer.",
  },
  {
    perenual_id: 100002,
    scientific_name: "Rosa 'Climbing'",
    common_name_en: "Climbing Rose",
    common_name_nl: "Klimroos",
    pruning_months: ["February", "March"],
    sunlight: ["full sun"],
    cycle: "Perennial",
    maintenance: "Moderate",
    description: "Climbing roses produce long canes that can be trained along walls and fences. Prune main framework in late winter; remove dead and weak wood.",
  },
  {
    perenual_id: 100003,
    scientific_name: "Rosa 'Ground Cover'",
    common_name_en: "Ground Cover Rose",
    common_name_nl: "Bodembedekkende roos",
    pruning_months: ["March"],
    sunlight: ["full sun"],
    cycle: "Perennial",
    maintenance: "Low",
    description: "Low-growing spreading roses used as ground cover. Light pruning in early spring to shape and remove dead wood.",
  },

  // ── Lavender ─────────────────────────────────────────────────────────────
  {
    perenual_id: 100010,
    scientific_name: "Lavandula angustifolia",
    common_name_en: "English Lavender",
    common_name_nl: "Lavendel",
    pruning_months: ["August", "September"],
    sunlight: ["full sun"],
    cycle: "Perennial",
    maintenance: "Low",
    description: "Aromatic herb with purple flower spikes. Prune back hard after flowering in late summer to keep the plant compact and bushy. Avoid cutting into old wood.",
  },
  {
    perenual_id: 100011,
    scientific_name: "Lavandula stoechas",
    common_name_en: "French Lavender",
    common_name_nl: "Franse lavendel",
    pruning_months: ["May", "June", "August"],
    sunlight: ["full sun"],
    cycle: "Perennial",
    maintenance: "Low",
    description: "French lavender with distinctive butterfly-wing bracts. Deadhead after each flush of blooms; prune lightly after main flowering season.",
  },

  // ── Hydrangea ────────────────────────────────────────────────────────────
  {
    perenual_id: 100020,
    scientific_name: "Hydrangea macrophylla",
    common_name_en: "Bigleaf Hydrangea",
    common_name_nl: "Boerenhortensia",
    pruning_months: ["March", "April"],
    sunlight: ["part shade", "full sun"],
    cycle: "Perennial",
    maintenance: "Moderate",
    description: "Popular garden shrub with large mophead or lacecap flower heads. Prune in spring once the risk of frost has passed — remove dead stems to ground; shorten others to strong buds.",
  },
  {
    perenual_id: 100021,
    scientific_name: "Hydrangea paniculata",
    common_name_en: "Panicle Hydrangea",
    common_name_nl: "Pluimhortensia",
    pruning_months: ["February", "March"],
    sunlight: ["full sun", "part shade"],
    cycle: "Perennial",
    maintenance: "Low",
    description: "Hardy hydrangea with conical white/pink flower clusters. Prune in late winter/early spring — cut back to two or three buds from the previous year's growth for largest blooms.",
  },
  {
    perenual_id: 100022,
    scientific_name: "Hydrangea arborescens",
    common_name_en: "Smooth Hydrangea",
    common_name_nl: "Boomhortensia",
    pruning_months: ["February", "March"],
    sunlight: ["part shade", "full sun"],
    cycle: "Perennial",
    maintenance: "Low",
    description: "North American native hydrangea with dome-shaped white flowers. Prune hard in late winter — cut back to about 30 cm above ground level.",
  },
  {
    perenual_id: 100023,
    scientific_name: "Hydrangea petiolaris",
    common_name_en: "Climbing Hydrangea",
    common_name_nl: "Klimhortensia",
    pruning_months: ["July"],
    sunlight: ["part shade"],
    cycle: "Perennial",
    maintenance: "Low",
    description: "Self-clinging climber with lacecap white flowers. Minimal pruning required — trim after flowering in midsummer to keep within bounds.",
  },

  // ── Boxwood ───────────────────────────────────────────────────────────────
  {
    perenual_id: 100030,
    scientific_name: "Buxus sempervirens",
    common_name_en: "Common Boxwood",
    common_name_nl: "Palmboompje",
    pruning_months: ["May", "June", "August"],
    sunlight: ["full sun", "part shade"],
    cycle: "Perennial",
    maintenance: "Moderate",
    description: "Slow-growing evergreen shrub ideal for hedges and topiary. Trim two or three times per growing season — first in late spring and again in late summer for neat formal shapes.",
  },

  // ── Yew ──────────────────────────────────────────────────────────────────
  {
    perenual_id: 100031,
    scientific_name: "Taxus baccata",
    common_name_en: "English Yew",
    common_name_nl: "Venijnboom",
    pruning_months: ["August", "September"],
    sunlight: ["full sun", "part shade"],
    cycle: "Perennial",
    maintenance: "Low",
    description: "Slow-growing evergreen conifer with red berries, excellent for hedges and topiary. Trim once in late summer; tolerates hard pruning and regenerates from old wood.",
  },

  // ── Privet ───────────────────────────────────────────────────────────────
  {
    perenual_id: 100032,
    scientific_name: "Ligustrum ovalifolium",
    common_name_en: "Oval-leaved Privet",
    common_name_nl: "Liguster",
    pruning_months: ["June", "August"],
    sunlight: ["full sun", "part shade"],
    cycle: "Perennial",
    maintenance: "Moderate",
    description: "Fast-growing semi-evergreen shrub widely used for hedging. Cut back hard after planting; trim 2–3 times in the growing season to maintain shape.",
  },

  // ── Lilac ─────────────────────────────────────────────────────────────────
  {
    perenual_id: 100040,
    scientific_name: "Syringa vulgaris",
    common_name_en: "Common Lilac",
    common_name_nl: "Gewone sering",
    pruning_months: ["May", "June"],
    sunlight: ["full sun"],
    cycle: "Perennial",
    maintenance: "Low",
    description: "Deciduous shrub renowned for its fragrant purple or white spring flowers. Deadhead immediately after flowering and remove suckers. Hard renovation pruning can be done in winter.",
  },

  // ── Forsythia ─────────────────────────────────────────────────────────────
  {
    perenual_id: 100041,
    scientific_name: "Forsythia x intermedia",
    common_name_en: "Forsythia",
    common_name_nl: "Chinees klokje",
    pruning_months: ["April", "May"],
    sunlight: ["full sun", "part shade"],
    cycle: "Perennial",
    maintenance: "Low",
    description: "Deciduous shrub with bright yellow flowers in early spring. Prune immediately after flowering — cut about one-third of old stems to ground level to encourage new growth.",
  },

  // ── Buddleja ──────────────────────────────────────────────────────────────
  {
    perenual_id: 100042,
    scientific_name: "Buddleja davidii",
    common_name_en: "Butterfly Bush",
    common_name_nl: "Vlinderstruik",
    pruning_months: ["March"],
    sunlight: ["full sun"],
    cycle: "Perennial",
    maintenance: "Low",
    description: "Fast-growing deciduous shrub with fragrant flower spikes loved by butterflies. Cut back hard in early spring (to about 30 cm) for the best flowering display.",
  },

  // ── Wisteria ──────────────────────────────────────────────────────────────
  {
    perenual_id: 100050,
    scientific_name: "Wisteria sinensis",
    common_name_en: "Chinese Wisteria",
    common_name_nl: "Chinese blauweregen",
    pruning_months: ["July", "August", "February"],
    sunlight: ["full sun"],
    cycle: "Perennial",
    maintenance: "High",
    description: "Vigorous deciduous climber with spectacular fragrant flower clusters. Prune twice a year: in summer (July/August) cut new shoots back to 5 leaves; in winter cut back to 2–3 buds.",
  },

  // ── Clematis ──────────────────────────────────────────────────────────────
  {
    perenual_id: 100051,
    scientific_name: "Clematis viticella",
    common_name_en: "Italian Clematis",
    common_name_nl: "Bosrank",
    pruning_months: ["February", "March"],
    sunlight: ["full sun", "part shade"],
    cycle: "Perennial",
    maintenance: "Low",
    description: "Group 3 clematis — cut back hard to 30 cm in late winter/early spring. Flowers on new season's growth from summer onwards.",
  },
  {
    perenual_id: 100052,
    scientific_name: "Clematis montana",
    common_name_en: "Mountain Clematis",
    common_name_nl: "Bergclematis",
    pruning_months: ["May", "June"],
    sunlight: ["full sun", "part shade"],
    cycle: "Perennial",
    maintenance: "Low",
    description: "Group 1 clematis — flowers on old wood in spring. Prune immediately after flowering if needed to control size; avoid late-season pruning.",
  },

  // ── Apple / Pear ─────────────────────────────────────────────────────────
  {
    perenual_id: 100060,
    scientific_name: "Malus domestica",
    common_name_en: "Apple Tree",
    common_name_nl: "Appelboom",
    pruning_months: ["December", "January", "February"],
    sunlight: ["full sun"],
    cycle: "Perennial",
    maintenance: "Moderate",
    description: "Deciduous fruit tree. Prune during dormancy in winter — remove crossing branches, dead wood, and water shoots. Aim for an open vase shape to allow light and air into the canopy.",
  },
  {
    perenual_id: 100061,
    scientific_name: "Pyrus communis",
    common_name_en: "Pear Tree",
    common_name_nl: "Perenboom",
    pruning_months: ["December", "January", "February"],
    sunlight: ["full sun"],
    cycle: "Perennial",
    maintenance: "Moderate",
    description: "Deciduous fruit tree. Prune in winter while dormant — create a central leader form; remove crowded, crossing and diseased branches.",
  },
  {
    perenual_id: 100062,
    scientific_name: "Prunus persica",
    common_name_en: "Peach Tree",
    common_name_nl: "Perzikboom",
    pruning_months: ["March", "April"],
    sunlight: ["full sun"],
    cycle: "Perennial",
    maintenance: "High",
    description: "Deciduous fruit tree. Prune in spring after blossom to minimise silver leaf disease risk — remove one-third of old fruited shoots; encourage new replacement growth.",
  },
  {
    perenual_id: 100063,
    scientific_name: "Prunus domestica",
    common_name_en: "Plum Tree",
    common_name_nl: "Pruimenboom",
    pruning_months: ["June", "July", "August"],
    sunlight: ["full sun"],
    cycle: "Perennial",
    maintenance: "Moderate",
    description: "Deciduous fruit tree. Prune in summer (never in winter) to avoid silver leaf disease — remove crossing branches and open up the canopy after harvest.",
  },
  {
    perenual_id: 100064,
    scientific_name: "Prunus cerasus",
    common_name_en: "Sour Cherry",
    common_name_nl: "Zure kers",
    pruning_months: ["July", "August"],
    sunlight: ["full sun"],
    cycle: "Perennial",
    maintenance: "Moderate",
    description: "Deciduous fruit tree. Prune after harvest in summer; remove one-third of older fruited shoots to encourage vigorous new growth for next year.",
  },

  // ── Berry bushes ──────────────────────────────────────────────────────────
  {
    perenual_id: 100070,
    scientific_name: "Ribes nigrum",
    common_name_en: "Blackcurrant",
    common_name_nl: "Zwarte bes",
    pruning_months: ["October", "November"],
    sunlight: ["full sun", "part shade"],
    cycle: "Perennial",
    maintenance: "Low",
    description: "Deciduous fruit shrub. After harvest, cut out one-third of oldest stems at ground level each autumn to maintain a rotation of young productive wood.",
  },
  {
    perenual_id: 100071,
    scientific_name: "Ribes rubrum",
    common_name_en: "Redcurrant",
    common_name_nl: "Rode bes",
    pruning_months: ["November", "December"],
    sunlight: ["full sun", "part shade"],
    cycle: "Perennial",
    maintenance: "Low",
    description: "Deciduous fruit shrub. Prune in winter — maintain a goblet shape by removing crossing branches; shorten side shoots to two buds.",
  },
  {
    perenual_id: 100072,
    scientific_name: "Rubus idaeus",
    common_name_en: "Raspberry",
    common_name_nl: "Framboos",
    pruning_months: ["October", "November"],
    sunlight: ["full sun"],
    cycle: "Perennial",
    maintenance: "Low",
    description: "Summer raspberries: after harvest cut all fruited canes to ground and tie in new canes. Autumn raspberries: cut all canes to ground in late winter.",
  },

  // ── Ornamental shrubs ─────────────────────────────────────────────────────
  {
    perenual_id: 100080,
    scientific_name: "Viburnum opulus",
    common_name_en: "European Cranberrybush",
    common_name_nl: "Gelderse roos",
    pruning_months: ["June"],
    sunlight: ["full sun", "part shade"],
    cycle: "Perennial",
    maintenance: "Low",
    description: "Deciduous shrub with snowball flowers in spring and red berries in autumn. Light pruning immediately after flowering; hard renovation pruning tolerates well.",
  },
  {
    perenual_id: 100081,
    scientific_name: "Philadelphus coronarius",
    common_name_en: "Mock Orange",
    common_name_nl: "Boerenjasmijn",
    pruning_months: ["July"],
    sunlight: ["full sun", "part shade"],
    cycle: "Perennial",
    maintenance: "Low",
    description: "Deciduous shrub with intensely fragrant white flowers. Prune immediately after flowering — cut about one-third of old flowered stems to ground level.",
  },
  {
    perenual_id: 100082,
    scientific_name: "Weigela florida",
    common_name_en: "Weigela",
    common_name_nl: "Weigela",
    pruning_months: ["June", "July"],
    sunlight: ["full sun"],
    cycle: "Perennial",
    maintenance: "Low",
    description: "Deciduous shrub with trumpet-shaped flowers in late spring. Prune after flowering — cut out about one-quarter of old stems at the base.",
  },
  {
    perenual_id: 100083,
    scientific_name: "Deutzia scabra",
    common_name_en: "Rough Deutzia",
    common_name_nl: "Bruidsbloem",
    pruning_months: ["June", "July"],
    sunlight: ["full sun"],
    cycle: "Perennial",
    maintenance: "Low",
    description: "Deciduous shrub with white or pink flowers in early summer. Prune immediately after flowering — remove flowered shoots and any weak or dead stems.",
  },
  {
    perenual_id: 100084,
    scientific_name: "Spiraea japonica",
    common_name_en: "Japanese Spirea",
    common_name_nl: "Spierstruik",
    pruning_months: ["March", "August"],
    sunlight: ["full sun"],
    cycle: "Perennial",
    maintenance: "Low",
    description: "Deciduous shrub with flat-topped pink/red flower clusters. Cut back hard in early spring; deadhead after first flush for possible repeat bloom.",
  },
  {
    perenual_id: 100085,
    scientific_name: "Cornus alba",
    common_name_en: "Red Dogwood",
    common_name_nl: "Rode kornoelje",
    pruning_months: ["March"],
    sunlight: ["full sun", "part shade"],
    cycle: "Perennial",
    maintenance: "Low",
    description: "Deciduous shrub grown for its vivid red winter stems. Cut all stems back hard to 5–10 cm in early spring every other year to maintain the brightest stem colour.",
  },
  {
    perenual_id: 100086,
    scientific_name: "Cotoneaster horizontalis",
    common_name_en: "Rockspray Cotoneaster",
    common_name_nl: "Dwergmispel",
    pruning_months: ["February", "March"],
    sunlight: ["full sun", "part shade"],
    cycle: "Perennial",
    maintenance: "Low",
    description: "Deciduous wall shrub with herringbone branch pattern, white flowers and red berries. Minimal pruning needed — trim back stems growing away from the wall in late winter.",
  },
  {
    perenual_id: 100087,
    scientific_name: "Pyracantha coccinea",
    common_name_en: "Scarlet Firethorn",
    common_name_nl: "Vuurdoorn",
    pruning_months: ["March", "June"],
    sunlight: ["full sun", "part shade"],
    cycle: "Perennial",
    maintenance: "Moderate",
    description: "Evergreen thorny shrub with white flowers and vivid orange/red berries. Prune wall-trained plants in spring; trim again after flowering in early summer.",
  },

  // ── Roses (species) ───────────────────────────────────────────────────────
  {
    perenual_id: 100090,
    scientific_name: "Rosa canina",
    common_name_en: "Dog Rose",
    common_name_nl: "Hondsroos",
    pruning_months: ["February", "March"],
    sunlight: ["full sun"],
    cycle: "Perennial",
    maintenance: "Low",
    description: "Wild hedgerow rose with single pink flowers and bright red hips. Minimal pruning — thin out one or two old stems in late winter to maintain vigour.",
  },

  // ── Perennials ────────────────────────────────────────────────────────────
  {
    perenual_id: 100100,
    scientific_name: "Paeonia lactiflora",
    common_name_en: "Chinese Peony",
    common_name_nl: "Pioenroos",
    pruning_months: ["October", "November"],
    sunlight: ["full sun"],
    cycle: "Perennial",
    maintenance: "Low",
    description: "Herbaceous perennial with large fragrant flowers in late spring. Cut stems to ground level in autumn after the foliage has died back. Do not cut in spring.",
  },
  {
    perenual_id: 100101,
    scientific_name: "Hosta",
    common_name_en: "Plantain Lily",
    common_name_nl: "Hartlelie",
    pruning_months: ["October", "November"],
    sunlight: ["part shade"],
    cycle: "Perennial",
    maintenance: "Low",
    description: "Shade-loving herbaceous perennial grown for decorative foliage. Cut back all stems and leaves to ground level in autumn after the first frost.",
  },
  {
    perenual_id: 100102,
    scientific_name: "Hemerocallis",
    common_name_en: "Daylily",
    common_name_nl: "Daglelie",
    pruning_months: ["October", "November"],
    sunlight: ["full sun"],
    cycle: "Perennial",
    maintenance: "Low",
    description: "Hardy perennial with trumpet-shaped flowers. Deadhead spent blooms through summer; cut foliage back to ground level in late autumn.",
  },
  {
    perenual_id: 100103,
    scientific_name: "Astilbe",
    common_name_en: "Astilbe",
    common_name_nl: "Pluimspirea",
    pruning_months: ["October", "November"],
    sunlight: ["part shade"],
    cycle: "Perennial",
    maintenance: "Low",
    description: "Moisture-loving perennial with feathery plumes of flowers. Leave seedheads for winter interest; cut back to ground level in late autumn or early spring.",
  },
  {
    perenual_id: 100104,
    scientific_name: "Geranium",
    common_name_en: "Hardy Geranium",
    common_name_nl: "Ooievaarsbek",
    pruning_months: ["July", "October"],
    sunlight: ["full sun", "part shade"],
    cycle: "Perennial",
    maintenance: "Low",
    description: "Ground-covering perennial with cup-shaped flowers. Cut back hard after first flush of flowers to encourage a second flush; tidy up in autumn.",
  },
  {
    perenual_id: 100105,
    scientific_name: "Salvia officinalis",
    common_name_en: "Common Sage",
    common_name_nl: "Salie",
    pruning_months: ["April", "August"],
    sunlight: ["full sun"],
    cycle: "Perennial",
    maintenance: "Low",
    description: "Aromatic culinary herb. Cut back hard in spring to stimulate new growth; lightly trim again after flowering in late summer. Avoid cutting into old woody stems.",
  },
  {
    perenual_id: 100106,
    scientific_name: "Nepeta x faassenii",
    common_name_en: "Catmint",
    common_name_nl: "Kattenkruid",
    pruning_months: ["July", "August"],
    sunlight: ["full sun"],
    cycle: "Perennial",
    maintenance: "Low",
    description: "Grey-leaved perennial with lavender-blue flowers. Cut back by half after the first flush of flowers in early summer to encourage a second flush.",
  },

  // ── Hedging ───────────────────────────────────────────────────────────────
  {
    perenual_id: 100110,
    scientific_name: "Carpinus betulus",
    common_name_en: "European Hornbeam",
    common_name_nl: "Haagbeuk",
    pruning_months: ["August"],
    sunlight: ["full sun", "part shade"],
    cycle: "Perennial",
    maintenance: "Low",
    description: "Deciduous hedging tree that retains dead leaves in winter. Clip formal hedges once a year in late summer (August).",
  },
  {
    perenual_id: 100111,
    scientific_name: "Fagus sylvatica",
    common_name_en: "European Beech",
    common_name_nl: "Beuk",
    pruning_months: ["August"],
    sunlight: ["full sun", "part shade"],
    cycle: "Perennial",
    maintenance: "Low",
    description: "Deciduous tree/hedge that retains copper-coloured dead leaves through winter when used as a clipped hedge. Trim once in late summer.",
  },
  {
    perenual_id: 100112,
    scientific_name: "Ilex aquifolium",
    common_name_en: "English Holly",
    common_name_nl: "Hulst",
    pruning_months: ["July", "August"],
    sunlight: ["full sun", "part shade"],
    cycle: "Perennial",
    maintenance: "Low",
    description: "Evergreen shrub/tree with glossy spiny leaves and red berries. Prune/shape in late summer; avoid pruning in late autumn to protect berries.",
  },

  // ── Climbers ──────────────────────────────────────────────────────────────
  {
    perenual_id: 100120,
    scientific_name: "Hedera helix",
    common_name_en: "Common Ivy",
    common_name_nl: "Klimop",
    pruning_months: ["March", "April"],
    sunlight: ["full sun", "part shade"],
    cycle: "Perennial",
    maintenance: "Low",
    description: "Self-clinging evergreen climber. Prune in early spring — cut back to control spread and remove flowering adult growth if desired.",
  },
  {
    perenual_id: 100121,
    scientific_name: "Parthenocissus quinquefolia",
    common_name_en: "Virginia Creeper",
    common_name_nl: "Wilde wingerd",
    pruning_months: ["November", "February"],
    sunlight: ["full sun", "part shade"],
    cycle: "Perennial",
    maintenance: "Low",
    description: "Self-clinging deciduous climber with spectacular autumn colour. Cut back hard in late autumn or late winter to keep within bounds; remove unwanted suckers.",
  },

  // ── Ornamental grasses ────────────────────────────────────────────────────
  {
    perenual_id: 100130,
    scientific_name: "Miscanthus sinensis",
    common_name_en: "Chinese Silver Grass",
    common_name_nl: "Chinees riet",
    pruning_months: ["February", "March"],
    sunlight: ["full sun"],
    cycle: "Perennial",
    maintenance: "Low",
    description: "Large ornamental grass with feathery plumes. Leave seedheads for winter interest and wildlife; cut back to near ground level in late winter before new growth starts.",
  },
  {
    perenual_id: 100131,
    scientific_name: "Pennisetum alopecuroides",
    common_name_en: "Fountain Grass",
    common_name_nl: "Lampenpoetsersgras",
    pruning_months: ["February", "March"],
    sunlight: ["full sun"],
    cycle: "Perennial",
    maintenance: "Low",
    description: "Ornamental grass with bristly bottlebrush flower spikes. Cut back to ground level in late winter before new growth begins.",
  },

  // ── Trees ─────────────────────────────────────────────────────────────────
  {
    perenual_id: 100140,
    scientific_name: "Prunus laurocerasus",
    common_name_en: "Cherry Laurel",
    common_name_nl: "Laurierkers",
    pruning_months: ["April", "August"],
    sunlight: ["full sun", "part shade"],
    cycle: "Perennial",
    maintenance: "Low",
    description: "Evergreen hedging shrub/tree with large glossy leaves. Trim with secateurs (not shears) in mid-spring and again in late summer to maintain shape without browning leaves.",
  },
  {
    perenual_id: 100141,
    scientific_name: "Magnolia stellata",
    common_name_en: "Star Magnolia",
    common_name_nl: "Beverboom",
    pruning_months: ["June"],
    sunlight: ["full sun"],
    cycle: "Perennial",
    maintenance: "Low",
    description: "Small deciduous shrub/tree with star-shaped white flowers in early spring before leaves. Minimal pruning required — only remove dead or crossing branches immediately after flowering.",
  },
  {
    perenual_id: 100142,
    scientific_name: "Magnolia x soulangeana",
    common_name_en: "Saucer Magnolia",
    common_name_nl: "Tulpenboom",
    pruning_months: ["June"],
    sunlight: ["full sun"],
    cycle: "Perennial",
    maintenance: "Low",
    description: "Deciduous large shrub/small tree with goblet-shaped pink-white flowers. Prune lightly after flowering — remove dead wood and crossing branches.",
  },
  {
    perenual_id: 100143,
    scientific_name: "Aesculus hippocastanum",
    common_name_en: "Horse Chestnut",
    common_name_nl: "Gewone paardenkastanje",
    pruning_months: ["December", "January"],
    sunlight: ["full sun"],
    cycle: "Perennial",
    maintenance: "Low",
    description: "Large deciduous tree grown for its candles of white flowers and conkers. Prune in winter during dormancy — remove dead, dying or crossing branches only.",
  },
  {
    perenual_id: 100144,
    scientific_name: "Tilia cordata",
    common_name_en: "Small-leaved Lime",
    common_name_nl: "Winterlinde",
    pruning_months: ["December", "January", "February"],
    sunlight: ["full sun"],
    cycle: "Perennial",
    maintenance: "Low",
    description: "Deciduous tree, popular as a street tree and for pleaching. Prune in winter during dormancy; pleached limes are trimmed in late summer.",
  },

  // ── Acid-loving shrubs ────────────────────────────────────────────────────
  {
    perenual_id: 100160,
    scientific_name: "Rhododendron",
    common_name_en: "Rhododendron",
    common_name_nl: "Rododendron",
    pruning_months: ["June"],
    sunlight: ["part shade"],
    cycle: "Perennial",
    maintenance: "Low",
    description: "Evergreen acid-loving shrub with spectacular flower trusses in spring. Deadhead spent flowers immediately after blooming; remove any weak or crossing branches. Hard pruning tolerated in early summer.",
  },
  {
    perenual_id: 100161,
    scientific_name: "Rhododendron (azalea group)",
    common_name_en: "Azalea",
    common_name_nl: "Azalea",
    pruning_months: ["June"],
    sunlight: ["part shade"],
    cycle: "Perennial",
    maintenance: "Low",
    description: "Deciduous or evergreen shrubs with abundant spring flowers. Deadhead after flowering; light shaping immediately after bloom. Avoid late-season pruning.",
  },
  {
    perenual_id: 100162,
    scientific_name: "Camellia japonica",
    common_name_en: "Japanese Camellia",
    common_name_nl: "Japanse roos",
    pruning_months: ["April", "May"],
    sunlight: ["part shade"],
    cycle: "Perennial",
    maintenance: "Low",
    description: "Evergreen acid-loving shrub with glossy leaves and rose-like flowers in winter/spring. Prune lightly immediately after flowering — remove any frost-damaged shoots and shape if needed.",
  },
  {
    perenual_id: 100163,
    scientific_name: "Pieris japonica",
    common_name_en: "Japanese Pieris",
    common_name_nl: "Vuurboom",
    pruning_months: ["April", "May"],
    sunlight: ["part shade"],
    cycle: "Perennial",
    maintenance: "Low",
    description: "Evergreen acid-loving shrub with cascading white flowers and vivid red new growth. Prune lightly after flowering to maintain shape; remove any frost-damaged shoots.",
  },
  {
    perenual_id: 100164,
    scientific_name: "Calluna vulgaris",
    common_name_en: "Heather",
    common_name_nl: "Struikheide",
    pruning_months: ["March", "April"],
    sunlight: ["full sun"],
    cycle: "Perennial",
    maintenance: "Low",
    description: "Low-growing evergreen shrub with pink/purple/white flowers in late summer. Clip over with shears in early spring — cut back into the previous year's growth but not into old bare wood.",
  },
  {
    perenual_id: 100165,
    scientific_name: "Erica carnea",
    common_name_en: "Winter Heath",
    common_name_nl: "Winterheide",
    pruning_months: ["April", "May"],
    sunlight: ["full sun"],
    cycle: "Perennial",
    maintenance: "Low",
    description: "Compact evergreen heather flowering from winter into spring. Clip lightly after flowering with shears to keep bushy and prevent straggly growth.",
  },
  {
    perenual_id: 100166,
    scientific_name: "Skimmia japonica",
    common_name_en: "Japanese Skimmia",
    common_name_nl: "Skimmia",
    pruning_months: ["April"],
    sunlight: ["part shade"],
    cycle: "Perennial",
    maintenance: "Low",
    description: "Compact evergreen shrub with fragrant white flowers and red berries. Rarely needs pruning — trim to shape immediately after flowering if required.",
  },

  // ── Herbs ─────────────────────────────────────────────────────────────────
  {
    perenual_id: 100170,
    scientific_name: "Rosmarinus officinalis",
    common_name_en: "Rosemary",
    common_name_nl: "Rozemarijn",
    pruning_months: ["April", "May"],
    sunlight: ["full sun"],
    cycle: "Perennial",
    maintenance: "Low",
    description: "Aromatic evergreen herb/shrub. Trim after flowering in late spring — cut back the flowered shoots but do not cut into old bare wood. Regular light harvesting keeps the plant bushy.",
  },
  {
    perenual_id: 100171,
    scientific_name: "Thymus vulgaris",
    common_name_en: "Common Thyme",
    common_name_nl: "Tijm",
    pruning_months: ["April", "August"],
    sunlight: ["full sun"],
    cycle: "Perennial",
    maintenance: "Low",
    description: "Aromatic low-growing herb. Trim back by about a third in spring to keep compact; trim lightly again after flowering in late summer. Never cut into old woody stems.",
  },
  {
    perenual_id: 100172,
    scientific_name: "Mentha",
    common_name_en: "Mint",
    common_name_nl: "Munt",
    pruning_months: ["July", "August", "October"],
    sunlight: ["full sun", "part shade"],
    cycle: "Perennial",
    maintenance: "Low",
    description: "Vigorous aromatic herb that spreads by runners. Cut back hard after the first flush of growth to encourage fresh leaves; cut to ground level in autumn. Best grown in containers.",
  },
  {
    perenual_id: 100173,
    scientific_name: "Foeniculum vulgare",
    common_name_en: "Fennel",
    common_name_nl: "Venkel",
    pruning_months: ["October", "March"],
    sunlight: ["full sun"],
    cycle: "Perennial",
    maintenance: "Low",
    description: "Tall aromatic perennial herb with feathery foliage and yellow flowers. Cut back to ground level in late autumn; divide congested clumps in spring.",
  },

  // ── Tender perennials / summer bulbs ──────────────────────────────────────
  {
    perenual_id: 100180,
    scientific_name: "Dahlia",
    common_name_en: "Dahlia",
    common_name_nl: "Dahlia",
    pruning_months: ["October", "November"],
    sunlight: ["full sun"],
    cycle: "Perennial",
    maintenance: "Moderate",
    description: "Half-hardy tuberous perennial with spectacular summer flowers. Pinch out growing tips in spring for bushy growth; deadhead regularly. After the first frost, cut back to 10 cm and lift tubers for winter storage.",
  },
  {
    perenual_id: 100181,
    scientific_name: "Fuchsia",
    common_name_en: "Fuchsia",
    common_name_nl: "Bellenplant",
    pruning_months: ["March", "April"],
    sunlight: ["part shade"],
    cycle: "Perennial",
    maintenance: "Moderate",
    description: "Half-hardy shrub with pendant two-toned flowers. In spring, cut back all shoots hard to 2–3 buds from the old wood once new growth appears. Standard fuchsias: remove all side shoots from the stem.",
  },
  {
    perenual_id: 100182,
    scientific_name: "Pelargonium",
    common_name_en: "Pelargonium (Geranium)",
    common_name_nl: "Geranium (balkonplant)",
    pruning_months: ["March"],
    sunlight: ["full sun"],
    cycle: "Annual",
    maintenance: "Low",
    description: "Tender perennial grown as an annual outdoors in cool climates. Deadhead regularly through summer; cut back by half and bring under glass in autumn. Hard prune in spring before putting out.",
  },
  {
    perenual_id: 100183,
    scientific_name: "Canna indica",
    common_name_en: "Canna Lily",
    common_name_nl: "Bloemriet",
    pruning_months: ["October", "November"],
    sunlight: ["full sun"],
    cycle: "Perennial",
    maintenance: "Moderate",
    description: "Tropical-looking tender perennial with large paddle leaves and vivid flowers. Deadhead faded flower spikes to encourage more blooms. Cut back and lift rhizomes before frost in cold climates.",
  },
  {
    perenual_id: 100184,
    scientific_name: "Agapanthus",
    common_name_en: "African Lily",
    common_name_nl: "Afrikaanse lelie",
    pruning_months: ["October"],
    sunlight: ["full sun"],
    cycle: "Perennial",
    maintenance: "Low",
    description: "Clump-forming perennial with ball-shaped blue or white flowers in summer. Deadhead spent flower stalks; cut back foliage in autumn (in colder climates protect crowns with mulch).",
  },

  // ── Spring bulbs ──────────────────────────────────────────────────────────
  {
    perenual_id: 100190,
    scientific_name: "Narcissus",
    common_name_en: "Daffodil",
    common_name_nl: "Narcis",
    pruning_months: ["May", "June"],
    sunlight: ["full sun", "part shade"],
    cycle: "Perennial",
    maintenance: "Low",
    description: "Spring-flowering bulb. Deadhead spent flowers immediately. Do NOT cut back the leaves until they have yellowed and died back naturally (about 6 weeks after flowering) — the foliage feeds the bulb for next year.",
  },
  {
    perenual_id: 100191,
    scientific_name: "Tulipa",
    common_name_en: "Tulip",
    common_name_nl: "Tulp",
    pruning_months: ["May", "June"],
    sunlight: ["full sun"],
    cycle: "Perennial",
    maintenance: "Low",
    description: "Spring-flowering bulb. Snap off seed heads after flowering to direct energy back to the bulb; leave foliage to die back naturally before removing.",
  },

  // ── More ornamental perennials ────────────────────────────────────────────
  {
    perenual_id: 100200,
    scientific_name: "Echinacea purpurea",
    common_name_en: "Purple Coneflower",
    common_name_nl: "Rode zonnehoed",
    pruning_months: ["February", "March"],
    sunlight: ["full sun"],
    cycle: "Perennial",
    maintenance: "Low",
    description: "Robust perennial with daisy-like pink/purple flowers beloved by pollinators. Leave seedheads over winter for birds; cut back to ground level in late winter before new growth begins.",
  },
  {
    perenual_id: 100201,
    scientific_name: "Rudbeckia fulgida",
    common_name_en: "Black-eyed Susan",
    common_name_nl: "Rudbeckia",
    pruning_months: ["February", "March"],
    sunlight: ["full sun"],
    cycle: "Perennial",
    maintenance: "Low",
    description: "Long-flowering perennial with golden-yellow petals and dark centres. Leave seedheads for birds in winter; cut back hard to ground level in late winter.",
  },
  {
    perenual_id: 100202,
    scientific_name: "Helenium autumnale",
    common_name_en: "Sneezeweed",
    common_name_nl: "Zonnekruid",
    pruning_months: ["May", "February"],
    sunlight: ["full sun"],
    cycle: "Perennial",
    maintenance: "Low",
    description: "Tall perennial with copper/orange/yellow daisy flowers from late summer. Chelsea-chop in late May delays flowering and prevents flopping. Cut back to ground in late winter.",
  },
  {
    perenual_id: 100203,
    scientific_name: "Aster amellus",
    common_name_en: "Italian Aster",
    common_name_nl: "Aster",
    pruning_months: ["May", "March"],
    sunlight: ["full sun"],
    cycle: "Perennial",
    maintenance: "Low",
    description: "Autumn-flowering perennial with star-shaped purple or pink flowers. Chelsea-chop in late spring for bushier growth; cut back to ground level in late winter.",
  },
  {
    perenual_id: 100204,
    scientific_name: "Sedum spectabile",
    common_name_en: "Ice Plant",
    common_name_nl: "Hemelsleutel",
    pruning_months: ["March"],
    sunlight: ["full sun"],
    cycle: "Perennial",
    maintenance: "Low",
    description: "Succulent-leaved perennial with flat-topped pink flower heads. Leave dried seedheads for winter interest and wildlife; cut back to ground level in early spring.",
  },
  {
    perenual_id: 100205,
    scientific_name: "Helleborus orientalis",
    common_name_en: "Lenten Rose",
    common_name_nl: "Nieskruid",
    pruning_months: ["January", "February"],
    sunlight: ["part shade"],
    cycle: "Perennial",
    maintenance: "Low",
    description: "Shade-loving perennial flowering in late winter/early spring. Cut back all old leaves to the ground in January/February before flower stems emerge — improves display and reduces leaf spot disease.",
  },
  {
    perenual_id: 100206,
    scientific_name: "Bergenia cordifolia",
    common_name_en: "Elephant's Ears",
    common_name_nl: "Bergenia",
    pruning_months: ["April"],
    sunlight: ["part shade"],
    cycle: "Perennial",
    maintenance: "Low",
    description: "Evergreen perennial with large leathery leaves and pink flower spikes in early spring. Remove old and tatty leaves and spent flower stems in spring; divide congested clumps every few years.",
  },
  {
    perenual_id: 100207,
    scientific_name: "Kniphofia uvaria",
    common_name_en: "Red Hot Poker",
    common_name_nl: "Vuurpijl",
    pruning_months: ["April"],
    sunlight: ["full sun"],
    cycle: "Perennial",
    maintenance: "Low",
    description: "Dramatic perennial with torch-like flower spikes in orange, red or yellow. Remove dead flower stems after blooming; tidy up old foliage in early spring — tie leaves in a bunch and cut as one.",
  },
  {
    perenual_id: 100208,
    scientific_name: "Echinops ritro",
    common_name_en: "Globe Thistle",
    common_name_nl: "Kogeldistel",
    pruning_months: ["October", "February"],
    sunlight: ["full sun"],
    cycle: "Perennial",
    maintenance: "Low",
    description: "Architectural perennial with spiky steel-blue spherical flower heads. Leave heads for birds and winter structure; cut back to ground level in late autumn or early spring.",
  },
  {
    perenual_id: 100209,
    scientific_name: "Acanthus mollis",
    common_name_en: "Bear's Breeches",
    common_name_nl: "Acanthus",
    pruning_months: ["October"],
    sunlight: ["full sun", "part shade"],
    cycle: "Perennial",
    maintenance: "Low",
    description: "Architectural perennial with deeply cut glossy leaves and tall flower spikes. Remove flower stalks after they fade; cut back old foliage in autumn.",
  },

  // ── Grasses & bamboo ──────────────────────────────────────────────────────
  {
    perenual_id: 100215,
    scientific_name: "Stipa tenuissima",
    common_name_en: "Mexican Feather Grass",
    common_name_nl: "Vedergras",
    pruning_months: ["March", "April"],
    sunlight: ["full sun"],
    cycle: "Perennial",
    maintenance: "Low",
    description: "Fine-textured ornamental grass with silky feathery plumes. Comb through with fingers in spring to remove dead material; cut back lightly if very tatty — avoid hard cutting.",
  },
  {
    perenual_id: 100216,
    scientific_name: "Molinia caerulea",
    common_name_en: "Purple Moor Grass",
    common_name_nl: "Pijpenstrootje",
    pruning_months: ["February", "March"],
    sunlight: ["full sun", "part shade"],
    cycle: "Perennial",
    maintenance: "Low",
    description: "Deciduous ornamental grass that collapses completely in autumn — old stems can be pulled away by hand in late winter. Cut any remaining stems back before new growth begins.",
  },
  {
    perenual_id: 100217,
    scientific_name: "Phyllostachys aurea",
    common_name_en: "Golden Bamboo",
    common_name_nl: "Goudenbamboe",
    pruning_months: ["May", "June"],
    sunlight: ["full sun", "part shade"],
    cycle: "Perennial",
    maintenance: "Moderate",
    description: "Running bamboo with golden-yellow canes. Thin out the oldest and weakest canes at ground level each year in late spring to maintain a healthy open clump; remove unwanted rhizome spread.",
  },

  // ── More climbers / wall shrubs ───────────────────────────────────────────
  {
    perenual_id: 100220,
    scientific_name: "Jasminum officinale",
    common_name_en: "Common Jasmine",
    common_name_nl: "Jasmijn",
    pruning_months: ["August", "September"],
    sunlight: ["full sun"],
    cycle: "Perennial",
    maintenance: "Low",
    description: "Vigorous twining climber with intensely fragrant white flowers in summer. Prune after flowering — cut out one in five of the oldest stems at the base and shorten others by about a third.",
  },
  {
    perenual_id: 100221,
    scientific_name: "Jasminum nudiflorum",
    common_name_en: "Winter Jasmine",
    common_name_nl: "Winterjasmijn",
    pruning_months: ["March", "April"],
    sunlight: ["full sun", "part shade"],
    cycle: "Perennial",
    maintenance: "Low",
    description: "Wall shrub/climber with bright yellow flowers on bare green stems in winter. Prune after flowering — cut back flowered shoots to 2–3 buds from the main framework.",
  },
  {
    perenual_id: 100222,
    scientific_name: "Lonicera periclymenum",
    common_name_en: "Honeysuckle",
    common_name_nl: "Wilde kamperfoelie",
    pruning_months: ["March", "August"],
    sunlight: ["full sun", "part shade"],
    cycle: "Perennial",
    maintenance: "Low",
    description: "Twining climber with fragrant cream/yellow flowers in summer. Prune lightly after flowering to remove dead wood and reduce congestion; hard renovation pruning in early spring if very overgrown.",
  },

  // ── More fruit ────────────────────────────────────────────────────────────
  {
    perenual_id: 100230,
    scientific_name: "Fragaria x ananassa",
    common_name_en: "Strawberry",
    common_name_nl: "Aardbei",
    pruning_months: ["August", "September"],
    sunlight: ["full sun"],
    cycle: "Perennial",
    maintenance: "Low",
    description: "Low-growing fruit plant. After harvest, cut back all old foliage to just above the crown; remove runners unless you want new plants. Renovate beds every 3 years.",
  },
  {
    perenual_id: 100231,
    scientific_name: "Ribes uva-crispa",
    common_name_en: "Gooseberry",
    common_name_nl: "Kruisbes",
    pruning_months: ["November", "December", "February"],
    sunlight: ["full sun", "part shade"],
    cycle: "Perennial",
    maintenance: "Moderate",
    description: "Deciduous spiny fruit shrub. Prune in winter — thin to an open goblet shape for good light and air circulation; shorten all side shoots to 2–3 buds.",
  },

  // ── Vegetables / edibles ──────────────────────────────────────────────────
  {
    perenual_id: 100150,
    scientific_name: "Vitis vinifera",
    common_name_en: "Grapevine",
    common_name_nl: "Wijnstok",
    pruning_months: ["December", "January", "February"],
    sunlight: ["full sun"],
    cycle: "Perennial",
    maintenance: "High",
    description: "Deciduous vine grown for fruit and ornament. Prune hard in mid-winter (the 'rod and spur' or Guyot system) — cut back all lateral shoots to 1–2 buds. Avoid pruning after buds break (bleeds badly).",
  },
  {
    perenual_id: 100151,
    scientific_name: "Ficus carica",
    common_name_en: "Fig",
    common_name_nl: "Vijgenboom",
    pruning_months: ["March", "April"],
    sunlight: ["full sun"],
    cycle: "Perennial",
    maintenance: "Moderate",
    description: "Deciduous fruit tree/shrub. Prune in spring once risk of frost has passed — remove winter-damaged shoots, dead wood, and any embryo figs larger than a pea.",
  },
];

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  // Load existing perenual_ids so we can report skips
  const { data: existing } = await supabase
    .from("plant_species")
    .select("perenual_id");
  const seededIds = new Set((existing ?? []).map((r) => r.perenual_id));
  console.log(`Already in DB: ${seededIds.size} plants`);

  const toInsert = PLANTS.filter((p) => !seededIds.has(p.perenual_id));
  console.log(`Plants to insert: ${toInsert.length} / ${PLANTS.length} (${PLANTS.length - toInsert.length} already seeded)\n`);

  if (toInsert.length === 0) {
    console.log("Nothing to do.");
    return;
  }

  if (DRY_RUN) {
    for (const p of toInsert) {
      console.log(`[DRY] ${p.common_name_en} (${p.scientific_name}) pruning: ${p.pruning_months.join(", ") || "none"}`);
    }
    return;
  }

  const rows = toInsert.map((p) => ({
    perenual_id: p.perenual_id,
    scientific_name: p.scientific_name,
    common_name_en: p.common_name_en,
    common_name_nl: p.common_name_nl ?? null,
    pruning_months: p.pruning_months ?? [],
    sunlight: p.sunlight ?? [],
    cycle: p.cycle ?? null,
    maintenance: p.maintenance ?? null,
    description: p.description ?? null,
    image_url: null,
  }));

  const { error } = await supabase
    .from("plant_species")
    .upsert(rows, { onConflict: "perenual_id" });

  if (error) {
    console.error("Insert failed:", error.message);
    process.exit(1);
  }

  for (const p of toInsert) {
    const pruneTag = p.pruning_months.length > 0
      ? ` pruning: ${p.pruning_months.join(", ")}`
      : "";
    console.log(`  ✓ ${p.common_name_en} (${p.scientific_name})${pruneTag}`);
  }

  console.log(`\nDone. Inserted ${toInsert.length} plants.`);

  // Final count
  const { count } = await supabase
    .from("plant_species")
    .select("*", { count: "exact", head: true });
  console.log(`Total plants in DB: ${count}`);
}

main().catch((e) => {
  console.error("Fatal:", e);
  process.exit(1);
});
