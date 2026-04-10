const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;
const BASE_URL = `${SUPABASE_URL}/functions/v1/plant-proxy`;

const HEADERS = {
  Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
  "Content-Type": "application/json",
};

/**
 * Search for plant species by name.
 * @param {string} query
 * @param {AbortSignal} signal
 * @param {'en'|'nl'} lang - language for common name results (default 'en')
 */
export async function searchPlants(query, signal, lang = "en") {
  if (!query || query.trim().length < 2) return [];

  const url = `${BASE_URL}?action=search&q=${encodeURIComponent(query.trim())}&lang=${lang}`;
  const res = await fetch(url, { headers: HEADERS, signal });
  if (!res.ok) throw new Error(`Plant search failed: ${res.status}`);

  const data = await res.json();
  return data.data ?? [];
}

/**
 * Fetch full species details including pruning_month, sunlight, cycle, etc.
 * @param {number} id - internal plant_species id or perenual_id
 * @param {AbortSignal} signal
 * @param {'en'|'nl'} lang - language for common name (default 'en')
 */
export async function getPlantDetails(id, signal, lang = "en") {
  const url = `${BASE_URL}?action=details&id=${encodeURIComponent(id)}&lang=${lang}`;
  const res = await fetch(url, { headers: HEADERS, signal });
  if (!res.ok) throw new Error(`Plant details failed: ${res.status}`);

  return res.json();
}
