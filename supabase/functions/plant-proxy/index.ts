import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

const ALLOWED_ORIGINS = new Set([
  "capacitor://localhost",   // iOS Capacitor
  "http://localhost",        // Android Capacitor (v3/v4)
  "https://localhost",       // Android Capacitor (v5+)
  "http://localhost:5173",   // Vite dev server
  "https://localhost:5173",  // Vite dev server (HTTPS)
]);

function corsHeaders(origin: string | null) {
  const allowedOrigin =
    origin && ALLOWED_ORIGINS.has(origin) ? origin : "capacitor://localhost";
  return {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
  } as Record<string, string>;
}

// Map a plant_species DB row to the shape perenualClient.js expects for search results
function toSearchResult(row: Record<string, unknown>, lang: string) {
  const commonName =
    lang === "nl"
      ? (row.common_name_nl as string | null) ?? (row.common_name_en as string | null)
      : (row.common_name_en as string | null);

  return {
    id: row.id,
    perenual_id: row.perenual_id,
    common_name: commonName,
    scientific_name: [row.scientific_name],
    cycle: row.cycle ?? null,
    popularity_nl: row.popularity_nl ?? 0,
    default_image: row.image_url
      ? { thumbnail: row.image_url, medium_url: row.image_url }
      : null,
  };
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

// Map a plant_species DB row to the shape perenualClient.js expects for details
function toDetailsResult(row: Record<string, unknown>, lang: string, imageUrl: string | null) {
  const commonName =
    lang === "nl"
      ? (row.common_name_nl as string | null) ?? (row.common_name_en as string | null)
      : (row.common_name_en as string | null);

  const description =
    lang === "nl"
      ? (row.description_nl as string | null) ?? (row.description as string | null)
      : (row.description as string | null);

  return {
    id: row.id,
    perenual_id: row.perenual_id,
    common_name: commonName,
    common_name_en: row.common_name_en,
    common_name_nl: row.common_name_nl,
    scientific_name: [row.scientific_name],
    pruning_month: row.pruning_months ?? [],
    sunlight: row.sunlight ?? [],
    cycle: row.cycle ?? null,
    maintenance: row.maintenance ?? null,
    description,
    default_image: imageUrl
      ? { thumbnail: imageUrl, medium_url: imageUrl }
      : null,
  };
}

Deno.serve(async (req) => {
  const origin = req.headers.get("origin");
  const cors = corsHeaders(origin);

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: cors });
  }

  if (req.method !== "GET") {
    return Response.json(
      { error: "Method not allowed" },
      { status: 405, headers: cors },
    );
  }

  const url = new URL(req.url);
  const action = url.searchParams.get("action");
  const lang = url.searchParams.get("lang") === "nl" ? "nl" : "en";

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  try {
    switch (action) {
      case "search": {
        const q = (url.searchParams.get("q") ?? "").trim();
        if (q.length < 2) {
          return Response.json({ data: [] }, { headers: cors });
        }

        // Search in the language-appropriate name column + scientific name
        // Uses pg_trgm via the ILIKE operator (fast enough for <2000 rows)
        const nameCol = lang === "nl" ? "common_name_nl" : "common_name_en";
        const pattern = `%${q}%`;

        const { data, error } = await supabase
          .from("plant_species")
          .select("id, perenual_id, common_name_en, common_name_nl, scientific_name, cycle, image_url, popularity_nl")
          .or(`${nameCol}.ilike.${pattern},scientific_name.ilike.${pattern}`)
          .order("popularity_nl", { ascending: false, nullsFirst: false })
          .order(nameCol, { ascending: true })
          .limit(10);

        if (error) throw error;

        const results = data ?? [];

        return Response.json(
          { data: results.map((r) => toSearchResult(r, lang)) },
          { headers: cors },
        );
      }

      case "details": {
        const idParam = url.searchParams.get("id") ?? "";
        // Accept both our internal id and perenual_id for backward compat
        const numId = parseInt(idParam, 10);
        if (isNaN(numId)) {
          return Response.json({ error: "Invalid id" }, { status: 400, headers: cors });
        }

        // Try internal id first, then perenual_id
        let { data, error } = await supabase
          .from("plant_species")
          .select("*")
          .eq("id", numId)
          .maybeSingle();

        if (!data && !error) {
          ({ data, error } = await supabase
            .from("plant_species")
            .select("*")
            .eq("perenual_id", numId)
            .maybeSingle());
        }

        if (error) throw error;
        if (!data) {
          return Response.json({ error: "Plant not found" }, { status: 404, headers: cors });
        }

        // If no image in DB (or broken Perenual/Wikimedia URL), fetch from iNaturalist and cache it
        let imageUrl = data.image_url as string | null;
        const needsFetch = !imageUrl || imageUrl.includes("perenual.com") || imageUrl.includes("wikimedia.org");
        if (needsFetch) {
          const sciName = data.scientific_name as string;
          const wikiThumb = await fetchINatThumbnail(sciName);
          if (wikiThumb) {
            imageUrl = wikiThumb;
            // Cache in DB so next request is instant (fire-and-forget)
            supabase
              .from("plant_species")
              .update({ image_url: wikiThumb })
              .eq("id", data.id)
              .then(() => {});
          }
        }

        return Response.json(toDetailsResult(data, lang, imageUrl), { headers: cors });
      }

      case "image": {
        const imgUrl = url.searchParams.get("url") ?? "";
        if (!imgUrl.startsWith("https://upload.wikimedia.org/")) {
          return Response.json({ error: "Invalid URL" }, { status: 400, headers: cors });
        }
        const imgRes = await fetch(imgUrl, {
          headers: {
            "User-Agent": "garden-watering-app/1.0 (image-proxy)",
            "Referer": "https://en.wikipedia.org/",
          },
        });
        if (!imgRes.ok) {
          return Response.json({ error: `Upstream ${imgRes.status}` }, { status: 502, headers: cors });
        }
        const contentType = imgRes.headers.get("content-type") ?? "image/jpeg";
        const data = await imgRes.arrayBuffer();
        return new Response(data, {
          headers: {
            ...cors,
            "Content-Type": contentType,
            "Cache-Control": "public, max-age=86400, stale-while-revalidate=86400",
          },
        });
      }

      default:
        return Response.json(
          { error: `Unknown action: ${action}` },
          { status: 400, headers: cors },
        );
    }
  } catch (e) {
    return Response.json(
      { error: String((e as Error)?.message ?? e) },
      { status: 500, headers: cors },
    );
  }
});
