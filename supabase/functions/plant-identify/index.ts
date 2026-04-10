import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const PLANTNET_API_KEY = Deno.env.get("PLANTNET_API_KEY") ?? "";

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

/** Decode base64 string to Uint8Array */
function base64ToBytes(b64: string): Uint8Array {
  // Strip data URI prefix if present (e.g. "data:image/jpeg;base64,")
  const raw = b64.includes(",") ? b64.split(",")[1] : b64;
  const binary = atob(raw);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

interface PlantNetResult {
  score: number;
  species: {
    scientificNameWithoutAuthor: string;
    commonNames: string[];
  };
}

interface Match {
  score: number;
  scientificName: string;
  commonName: string | null;
  /** Internal plant_species.id if found in DB, otherwise null */
  dbId: number | null;
}

/** Search plant_species table for a scientific name match (genus + species level) */
async function findInDb(
  supabase: ReturnType<typeof createClient>,
  scientificName: string,
  lang: string,
): Promise<{ id: number; commonName: string | null } | null> {
  // Match on first two words (genus + species), ignore author/cultivar
  const genusSpecies = scientificName.split(" ").slice(0, 2).join(" ");

  const { data, error } = await supabase
    .from("plant_species")
    .select("id, common_name_en, common_name_nl")
    .ilike("scientific_name", `${genusSpecies}%`)
    .limit(1)
    .maybeSingle();

  if (error || !data) return null;

  const commonName =
    lang === "nl"
      ? (data.common_name_nl as string | null) ?? (data.common_name_en as string | null)
      : (data.common_name_en as string | null);

  return { id: data.id as number, commonName };
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

  if (!PLANTNET_API_KEY) {
    return Response.json({ error: "PlantNet API key not configured" }, { status: 503, headers: cors });
  }

  let body: { image: string; mimeType?: string; lang?: string };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400, headers: cors });
  }

  if (!body.image) {
    return Response.json({ error: "Missing image field" }, { status: 400, headers: cors });
  }

  const mimeType = body.mimeType ?? "image/jpeg";
  const lang = body.lang === "nl" ? "nl" : "en";

  // Decode base64 → binary
  let imageBytes: Uint8Array;
  try {
    imageBytes = base64ToBytes(body.image);
  } catch {
    return Response.json({ error: "Invalid base64 image" }, { status: 400, headers: cors });
  }

  // Build multipart/form-data for PlantNet
  const formData = new FormData();
  formData.append("images", new Blob([imageBytes], { type: mimeType }), "plant.jpg");
  formData.append("organs", "auto");

  const plantNetUrl =
    `https://my-api.plantnet.org/v2/identify/all?api-key=${PLANTNET_API_KEY}&nb-results=5&lang=en`;

  let plantNetResults: PlantNetResult[] = [];
  try {
    const res = await fetch(plantNetUrl, { method: "POST", body: formData });
    if (!res.ok) {
      const errText = await res.text();
      console.error("PlantNet error", res.status, errText);
      return Response.json(
        { error: `PlantNet API error: ${res.status}` },
        { status: 502, headers: cors },
      );
    }
    const data = await res.json();
    plantNetResults = (data.results as PlantNetResult[]) ?? [];
  } catch (e) {
    console.error("PlantNet fetch failed", e);
    return Response.json({ error: "Failed to reach PlantNet API" }, { status: 502, headers: cors });
  }

  // Take top 3 results, look each up in our plant_species DB
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const top3 = plantNetResults.slice(0, 3);

  const matches: Match[] = await Promise.all(
    top3.map(async (r) => {
      const scientificName = r.species.scientificNameWithoutAuthor;
      const plantNetCommonName = r.species.commonNames?.[0] ?? null;
      const dbRow = await findInDb(supabase, scientificName, lang);

      return {
        score: Math.round(r.score * 100),
        scientificName,
        // Prefer DB common name (localised), fall back to PlantNet's English name
        commonName: dbRow?.commonName ?? plantNetCommonName,
        dbId: dbRow?.id ?? null,
      };
    }),
  );

  return Response.json({ matches }, { headers: cors });
});
