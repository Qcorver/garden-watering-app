import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const PLANTNET_API_KEY = Deno.env.get("PLANTNET_API_KEY") ?? "";
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

/** Decode base64 string to Uint8Array */
function base64ToBytes(b64: string): Uint8Array {
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
  imageUrl: string | null;
}

interface LabelDetection {
  isLabel: boolean;
  scientificName: string | null;
  commonName: string | null;
}

/** Search plant_species table for a scientific name match (genus + species level) */
async function findInDb(
  supabase: ReturnType<typeof createClient>,
  scientificName: string,
  lang: string,
): Promise<{ id: number; commonName: string | null; imageUrl: string | null } | null> {
  const genusSpecies = scientificName.split(" ").slice(0, 2).join(" ");

  const { data, error } = await supabase
    .from("plant_species")
    .select("id, common_name_en, common_name_nl, image_url")
    .ilike("scientific_name", `${genusSpecies}%`)
    .limit(1)
    .maybeSingle();

  if (error || !data) return null;

  const commonName =
    lang === "nl"
      ? (data.common_name_nl as string | null) ?? (data.common_name_en as string | null)
      : (data.common_name_en as string | null);

  return { id: data.id as number, commonName, imageUrl: data.image_url as string | null };
}

/**
 * Ask Claude Haiku Vision whether the image is a plant label/tag.
 * Returns { isLabel, scientificName, commonName } or null on failure (caller falls back to PlantNet).
 */
async function detectLabel(base64: string, mimeType: string): Promise<LabelDetection | null> {
  if (!ANTHROPIC_API_KEY) return null;

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
        max_tokens: 128,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "image",
                source: { type: "base64", media_type: mimeType, data: base64 },
              },
              {
                type: "text",
                text: `Is this a plant label, tag, or sticker (the kind sold with plants in garden centres)?
If yes, extract the scientific name and common name printed on it.
Reply with JSON only, no other text:
{"isLabel":true,"scientificName":"...","commonName":"..."}
or
{"isLabel":false}`,
              },
            ],
          },
        ],
      }),
    });

    if (!res.ok) return null;
    const data = await res.json();
    const text: string = data?.content?.[0]?.text ?? "";
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return null;
    return JSON.parse(match[0]) as LabelDetection;
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

  let body: { image: string; mimeType?: string; lang?: string };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400, headers: cors });
  }

  if (!body.image) {
    return Response.json({ error: "Missing image field" }, { status: 400, headers: cors });
  }

  const mimeType = (body.mimeType ?? "image/jpeg") as string;
  const lang = body.lang === "nl" ? "nl" : "en";
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  // --- Run Claude label detection + PlantNet in parallel ---
  if (!PLANTNET_API_KEY) {
    return Response.json({ error: "PlantNet API key not configured" }, { status: 503, headers: cors });
  }

  let imageBytes: Uint8Array;
  try {
    imageBytes = base64ToBytes(body.image);
  } catch {
    return Response.json({ error: "Invalid base64 image" }, { status: 400, headers: cors });
  }

  const formData = new FormData();
  formData.append("images", new Blob([imageBytes], { type: mimeType }), "plant.jpg");
  formData.append("organs", "auto");

  const plantNetUrl =
    `https://my-api.plantnet.org/v2/identify/all?api-key=${PLANTNET_API_KEY}&nb-results=5&lang=en`;

  const [label, plantNetRes] = await Promise.all([
    detectLabel(body.image, mimeType),
    fetch(plantNetUrl, { method: "POST", body: formData }).catch(() => null),
  ]);

  // If Claude recognised a label, use that result (PlantNet result discarded)
  if (label?.isLabel && label.scientificName) {
    const dbRow = await findInDb(supabase, label.scientificName, lang);
    const match: Match = {
      score: 100,
      scientificName: label.scientificName,
      commonName: dbRow?.commonName ?? label.commonName ?? null,
      dbId: dbRow?.id ?? null,
      imageUrl: dbRow?.imageUrl ?? null,
    };
    return Response.json({ matches: [match], source: "label" }, { headers: cors });
  }

  // Not a label → use PlantNet result
  if (!plantNetRes?.ok) {
    const errText = await plantNetRes?.text().catch(() => "");
    console.error("PlantNet error", plantNetRes?.status, errText);
    return Response.json(
      { error: `PlantNet API error: ${plantNetRes?.status ?? "network error"}` },
      { status: 502, headers: cors },
    );
  }

  const plantNetData = await plantNetRes.json();
  const plantNetResults: PlantNetResult[] = plantNetData.results ?? [];

  const top3 = plantNetResults.slice(0, 3);
  const matches: Match[] = await Promise.all(
    top3.map(async (r) => {
      const scientificName = r.species.scientificNameWithoutAuthor;
      const plantNetCommonName = r.species.commonNames?.[0] ?? null;
      const dbRow = await findInDb(supabase, scientificName, lang);

      return {
        score: Math.round(r.score * 100),
        scientificName,
        commonName: dbRow?.commonName ?? plantNetCommonName,
        dbId: dbRow?.id ?? null,
        imageUrl: dbRow?.imageUrl ?? null,
      };
    }),
  );

  return Response.json({ matches, source: "plantnet" }, { headers: cors });
});
