export async function fetchRainHistory(lat, lon) {
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&past_days=7&forecast_days=0&daily=rain_sum&timezone=auto`;

  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch historical rain data (${res.status})`);
  const data = await res.json();

  const rain = data.daily?.rain_sum ?? []; // array (oldest -> newest)
  const safe = rain.map(v => (typeof v === "number" ? v : 0));

  const rainLast7Total = safe.reduce((s, v) => s + v, 0);
  const rainLast2Days = safe.slice(-2).reduce((s, v) => s + v, 0);
  const rainLast3Days = safe.slice(-3).reduce((s, v) => s + v, 0);
  const rainLast5Days = safe.slice(-5).reduce((s, v) => s + v, 0);
  const maxDailyRainLast7 = Math.max(0, ...safe);

  return { rainLast7Total, rainLast2Days, rainLast3Days, rainLast5Days, maxDailyRainLast7 };
}

/**
 * Fetch daily rainfall history (mm) for the past N days.
 * Returns: [{ date: Date, rainMm: number }]
 */
export async function fetchDailyRainHistory(lat, lon, pastDays = 30) {
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&past_days=${pastDays}&forecast_days=0&daily=rain_sum&timezone=auto`;

  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to fetch daily rain history (${res.status})`);
  }

  const data = await res.json();
  const dates = data.daily?.time ?? [];
  const rain = data.daily?.rain_sum ?? [];

  return dates.map((d, i) => ({
    date: new Date(`${d}T00:00:00`),
    rainMm: typeof rain[i] === "number" ? rain[i] : 0,
  }));
}