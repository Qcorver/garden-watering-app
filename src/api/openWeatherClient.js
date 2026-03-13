// src/api/openWeatherClient.js
// All OpenWeather requests go through the weather-proxy Edge Function
// so the API key stays server-side.

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;
const PROXY_BASE = `${SUPABASE_URL}/functions/v1/weather-proxy`;

async function proxyFetch(params, signal) {
  const qs = new URLSearchParams(params).toString();
  const res = await fetch(`${PROXY_BASE}?${qs}`, {
    headers: {
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    },
    signal,
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Weather proxy error (${res.status}): ${body}`);
  }

  return res.json();
}

/**
 * Search locations for autocomplete.
 * Returns normalized results: [{ label, value, lat, lon }]
 */
export async function searchLocations(query, limit = 6, signal) {
  const q = (query || "").trim();
  if (q.length < 2) return [];

  const data = await proxyFetch({ action: "search", q, limit: String(limit) }, signal);

  return (data || []).map((loc) => {
    const name = loc?.name ?? "";
    const country = loc?.country ?? "";
    const state = loc?.state ?? null;

    const label = state ? `${name}, ${state}, ${country}` : `${name}, ${country}`;
    const value = country ? `${name},${country}` : name;

    return { label, value, lat: loc?.lat, lon: loc?.lon };
  });
}

/**
 * Geocode a city name (e.g. "Amstelveen,NL") to lat/lon.
 */
export async function geocodeCity(cityName, signal) {
  const data = await proxyFetch({ action: "geocode", q: cityName }, signal);

  if (!data.length) {
    throw new Error(`City not found: ${cityName}`);
  }

  return { lat: data[0].lat, lon: data[0].lon };
}

/**
 * Reverse geocode lat/lon to a city name.
 * Returns "City,CC" string or null.
 */
export async function reverseGeocode(lat, lon) {
  const data = await proxyFetch({
    action: "reverse",
    lat: String(lat),
    lon: String(lon),
  });

  const city = data?.[0]?.name;
  const country = data?.[0]?.country;

  if (!city) return null;
  return country ? `${city},${country}` : city;
}

/**
 * Fetch 5-day / 3-hour forecast for a given city name.
 */
export async function fetchForecastForCity(cityName, signal) {
  return proxyFetch({ action: "forecast", q: cityName }, signal);
}

/**
 * Convert OpenWeather 5-day / 3-hour forecast into:
 * - rainNext3 (mm in next 3 days)
 * - dailyForecastNext5 (array of 5 days with { date, rainMm, main })
 */
export function extractRainDataFromForecast(forecast) {
  const list = forecast?.list || [];

  const byDay = new Map();

  const conditionRank = {
    Thunderstorm: 5,
    Rain: 4,
    Drizzle: 4,
    Snow: 4,
    Clouds: 2,
    Clear: 1,
  };

  for (const entry of list) {
    const dt = new Date(entry.dt * 1000);
    const dayKey = new Date(dt.getFullYear(), dt.getMonth(), dt.getDate())
      .toISOString()
      .slice(0, 10);

    const rain3h = entry.rain?.["3h"] ?? 0;
    const main = entry.weather?.[0]?.main ?? null;
    const score = main ? conditionRank[main] ?? 0 : 0;

    const prev =
      byDay.get(dayKey) ?? {
        rainMm: 0,
        main: null,
        score: 0,
      };

    const next = {
      rainMm: prev.rainMm + rain3h,
      main: prev.main,
      score: prev.score,
    };

    if (score > prev.score) {
      next.main = main;
      next.score = score;
    }

    byDay.set(dayKey, next);
  }

  const daily = Array.from(byDay.entries())
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([dayKey, value]) => ({
      date: new Date(dayKey + "T00:00:00"),
      rainMm: value.rainMm,
      main: value.main,
    }));

  const today = startOfToday();
  const next5Days = daily.filter((d) => d.date >= today).slice(0, 5);

  const rainNext3 = next5Days
    .slice(0, 3)
    .reduce((sum, d) => sum + (d.rainMm || 0), 0);

  return {
    rainLast7: 0,
    rainNext3,
    dailyForecastNext5: next5Days,
  };
}

function startOfToday() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}
