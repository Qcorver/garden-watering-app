import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY") ?? "";

const ALLOWED_ORIGINS = new Set([
  "capacitor://localhost",
  "http://localhost",
  "https://localhost",
  "http://localhost:5173",
  "https://localhost:5173",
]);

function corsHeaders(origin: string | null) {
  const allowedOrigin =
    origin && ALLOWED_ORIGINS.has(origin) ? origin : "capacitor://localhost";
  return {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  } as Record<string, string>;
}

async function fetchWikidataNames(
  scientificName: string,
): Promise<{ en: string | null; nl: string | null }> {
  const binomial = scientificName.trim().split(/\s+/).slice(0, 2).join(" ");
  const sparql = `
    SELECT ?labelEn ?labelNl WHERE {
      ?item wdt:P225 "${binomial.replace(/"/g, '\\"')}".
      OPTIONAL { ?item rdfs:label ?labelEn . FILTER(LANG(?labelEn) = "en") }
      OPTIONAL { ?item rdfs:label ?labelNl . FILTER(LANG(?labelNl) = "nl") }
    } LIMIT 1
  `.trim();

  try {
    const res = await fetch(
      "https://query.wikidata.org/sparql?query=" +
        encodeURIComponent(sparql) +
        "&format=json",
      { headers: { "User-Agent": "GardenWateringApp/1.0" } },
    );
    if (!res.ok) return { en: null, nl: null };
    const data = await res.json();
    const binding = data?.results?.bindings?.[0];
    const en = binding?.labelEn?.value ?? null;
    const nl = binding?.labelNl?.value ?? null;
    return {
      en: en && /^Q\d+$/.test(en) ? null : en,
      nl: nl && /^Q\d+$/.test(nl) ? null : nl,
    };
  } catch {
    return { en: null, nl: null };
  }
}

async function fetchINatThumbnail(scientificName: string): Promise<string | null> {
  try {
    const res = await fetch(
      `https://api.inaturalist.org/v1/taxa?q=${encodeURIComponent(scientificName)}&per_page=1&locale=en`,
      { headers: { "User-Agent": "garden-watering-app/1.0" } },
    );
    if (!res.ok) return null;
    const data = await res.json();
    const photo = data?.results?.[0]?.default_photo;
    return photo?.medium_url ?? photo?.square_url ?? null;
  } catch {
    return null;
  }
}

interface PlantData {
  pruning_months: string[];
  sunlight: string[];
  cycle: string;
  maintenance: string;
  description: string;
  description_nl: string;
}

async function enrichWithClaude(
  scientificName: string,
  commonNameEn: string | null,
): Promise<PlantData | null> {
  if (!ANTHROPIC_API_KEY) return null;

  const displayName = commonNameEn
    ? `${commonNameEn} (${scientificName})`
    : scientificName;

  const prompt = `You are a horticultural expert. Return a JSON object with plant data for "${displayName}".

Return ONLY valid JSON, no explanation:
{
  "pruning_months": [],
  "sunlight": [],
  "cycle": "",
  "maintenance": "",
  "description": "",
  "description_nl": ""
}

Field rules:
- pruning_months: array of lowercase month names (e.g. ["february","march"]) for temperate Western Europe. Empty array if no pruning needed.
- sunlight: one or more of: "full_sun", "part_shade", "shade"
- cycle: one of: "annual", "biennial", "perennial", "shrub", "tree", "bulb", "unknown"
- maintenance: one of: "Low", "Moderate", "High"
- description: 1-2 sentence English description
- description_nl: 1-2 sentence Dutch description`;

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 512,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!res.ok) return null;
    const data = await res.json();
    const text = data?.content?.[0]?.text ?? "";
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;
    return JSON.parse(jsonMatch[0]) as PlantData;
  } catch {
    return null;
  }
}

Deno.serve(async (req) => {
  const origin = req.headers.get("origin");
  const cors = corsHeaders(origin);

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: cors });
  }

  if (req.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405, headers: cors });
  }

  let body: { scientificName: string; commonName?: string };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400, headers: cors });
  }

  const { scientificName, commonName } = body;
  if (!scientificName?.trim()) {
    return Response.json({ error: "Missing scientificName" }, { status: 400, headers: cors });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const genusSpecies = scientificName.trim().split(/\s+/).slice(0, 2).join(" ");

  // Race-condition guard: another request may have already inserted this plant
  const { data: existing } = await supabase
    .from("plant_species")
    .select("id")
    .ilike("scientific_name", `${genusSpecies}%`)
    .limit(1)
    .maybeSingle();

  if (existing) {
    return Response.json({ id: existing.id }, { headers: cors });
  }

  // Fetch all data in parallel
  const [wikidataNames, imageUrl, claudeData] = await Promise.all([
    fetchWikidataNames(scientificName),
    fetchINatThumbnail(scientificName),
    enrichWithClaude(scientificName, commonName ?? null),
  ]);

  const commonNameEn = wikidataNames.en ?? commonName ?? null;

  const row = {
    scientific_name: genusSpecies,
    common_name_en: commonNameEn,
    common_name_nl: wikidataNames.nl ?? null,
    pruning_months: claudeData?.pruning_months ?? [],
    sunlight: claudeData?.sunlight ?? [],
    cycle: claudeData?.cycle ?? null,
    maintenance: claudeData?.maintenance ?? null,
    description: claudeData?.description ?? null,
    description_nl: claudeData?.description_nl ?? null,
    image_url: imageUrl,
  };

  const { data: inserted, error } = await supabase
    .from("plant_species")
    .insert(row)
    .select("id")
    .single();

  if (error) {
    // Concurrent insert — fetch the row that won the race
    if (error.code === "23505") {
      const { data: race } = await supabase
        .from("plant_species")
        .select("id")
        .ilike("scientific_name", `${genusSpecies}%`)
        .limit(1)
        .maybeSingle();
      if (race) return Response.json({ id: race.id }, { headers: cors });
    }
    return Response.json({ error: error.message }, { status: 500, headers: cors });
  }

  return Response.json({ id: inserted.id }, { headers: cors });
});
