export async function fetchRainHistory(lat, lon, signal) {
  // forecast_days=1 includes today's nowcast so the wet-soil gates capture rain falling right now.
  // precipitation_sum covers all precipitation types (rain + showers + drizzle), unlike rain_sum
  // which only counts large-scale systems and misses convective showers common in NL in spring/summer.
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&past_days=7&forecast_days=1&daily=precipitation_sum,temperature_2m_max,temperature_2m_min&timezone=auto`;

  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`Failed to fetch historical rain data (${res.status})`);
  const data = await res.json();

  const dates = data.daily?.time ?? [];
  const rain = data.daily?.precipitation_sum ?? []; // oldest → newest; index 7 = today (nowcast)
  const tmaxArr = data.daily?.temperature_2m_max ?? [];
  const tminArr = data.daily?.temperature_2m_min ?? [];

  const safe = rain.map(v => (typeof v === "number" ? v : 0));

  // Separate the 7 historical days from today's nowcast entry.
  const historical = safe.slice(0, 7);
  const todayMm = safe.length >= 8 ? safe[7] : 0;

  // rainLast7Total uses historical only — today is already in rainNext3 (from OpenWeather forecast)
  // so including it here would double-count it in weeklyRainCoverage.
  const rainLast7Total = historical.reduce((s, v) => s + v, 0);

  // Wet-soil gates include today so that rain falling right now is picked up immediately.
  const rainLast2Days = historical.slice(-1).reduce((s, v) => s + v, 0) + todayMm;
  const rainLast3Days = historical.slice(-2).reduce((s, v) => s + v, 0) + todayMm;
  const rainLast5Days = historical.slice(-4).reduce((s, v) => s + v, 0) + todayMm;
  const maxDailyRainLast7 = Math.max(0, todayMm, ...historical);

  // Temperature data is for historical days only (ET₀ computation doesn't need today).
  const allTempDays = dates.slice(0, 7).map((d, i) => ({ date: new Date(`${d}T00:00:00`), tmax: tmaxArr[i], tmin: tminArr[i] }));
  const tempLast7 = allTempDays.filter(d => typeof d.tmax === "number" && typeof d.tmin === "number");
  if (tempLast7.length < allTempDays.length) {
    console.warn(`[openMeteo] ${allTempDays.length - tempLast7.length} day(s) dropped from ET₀ calculation due to missing temperature data`);
  }

  return { rainLast7Total, rainLast2Days, rainLast3Days, rainLast5Days, maxDailyRainLast7, tempLast7 };
}

/**
 * Fetch daily rainfall history (mm) for the past N days, plus today's nowcast.
 * forecast_days=1 adds today's *measured* precipitation so the calendar can show
 * rain that already fell this morning even when the forecast said dry.
 * Returns: [{ date: Date, rainMm: number, cloudCoverMean: number|null }]
 */
export async function fetchDailyRainHistory(lat, lon, pastDays = 30, signal) {
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&past_days=${pastDays}&forecast_days=1&daily=precipitation_sum,cloud_cover_mean&timezone=auto`;

  const res = await fetch(url, { signal });
  if (!res.ok) {
    throw new Error(`Failed to fetch daily rain history (${res.status})`);
  }

  const data = await res.json();
  const dates = data.daily?.time ?? [];
  const rain = data.daily?.precipitation_sum ?? [];
  const cloud = data.daily?.cloud_cover_mean ?? [];

  return dates.map((d, i) => ({
    date: new Date(`${d}T00:00:00`),
    rainMm: typeof rain[i] === "number" ? rain[i] : 0,
    cloudCoverMean: typeof cloud[i] === "number" ? cloud[i] : null,
  }));
}