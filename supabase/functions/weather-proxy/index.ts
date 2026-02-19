import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const OPENWEATHER_API_KEY = Deno.env.get("OPENWEATHER_API_KEY") ?? "";

function corsHeaders(origin: string | null) {
  return {
    "Access-Control-Allow-Origin": origin ?? "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
  } as Record<string, string>;
}

Deno.serve(async (req) => {
  const origin = req.headers.get("origin");
  const cors = corsHeaders(origin);

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: cors });
  }

  if (req.method !== "GET") {
    return Response.json({ error: "Method not allowed" }, { status: 405, headers: cors });
  }

  if (!OPENWEATHER_API_KEY) {
    return Response.json(
      { error: "OPENWEATHER_API_KEY secret not configured" },
      { status: 500, headers: cors },
    );
  }

  const url = new URL(req.url);
  const action = url.searchParams.get("action");

  try {
    let apiUrl: string;

    switch (action) {
      case "search": {
        const q = url.searchParams.get("q") ?? "";
        const limit = url.searchParams.get("limit") ?? "6";
        apiUrl = `https://api.openweathermap.org/geo/1.0/direct?q=${encodeURIComponent(q)}&limit=${encodeURIComponent(limit)}&appid=${OPENWEATHER_API_KEY}`;
        break;
      }
      case "geocode": {
        const q = url.searchParams.get("q") ?? "";
        apiUrl = `https://api.openweathermap.org/geo/1.0/direct?q=${encodeURIComponent(q)}&limit=1&appid=${OPENWEATHER_API_KEY}`;
        break;
      }
      case "reverse": {
        const lat = url.searchParams.get("lat") ?? "";
        const lon = url.searchParams.get("lon") ?? "";
        apiUrl = `https://api.openweathermap.org/geo/1.0/reverse?lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lon)}&limit=1&appid=${OPENWEATHER_API_KEY}`;
        break;
      }
      case "forecast": {
        const q = url.searchParams.get("q") ?? "";
        apiUrl = `https://api.openweathermap.org/data/2.5/forecast?q=${encodeURIComponent(q)}&units=metric&appid=${OPENWEATHER_API_KEY}`;
        break;
      }
      default:
        return Response.json(
          { error: `Unknown action: ${action}` },
          { status: 400, headers: cors },
        );
    }

    const res = await fetch(apiUrl);
    const data = await res.json();

    if (!res.ok) {
      return Response.json(data, { status: res.status, headers: cors });
    }

    return Response.json(data, { headers: cors });
  } catch (e) {
    return Response.json(
      { error: String((e as Error)?.message ?? e) },
      { status: 500, headers: cors },
    );
  }
});
