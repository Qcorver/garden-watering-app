// Canonical watering logic — shared between frontend and push-daily edge function.
// If you change this file, both consumers pick up the change automatically.

// Target: plants need at least 20 L/m² per week (≈ 20 mm of water)
export const WEEKLY_TARGET = 20; // mm

// Used to pick a good watering day from the forecast
export const DRY_DAY_THRESHOLD = 1; // mm

// "Soil likely still wet" gates (tweakable)
export const WET_48H_MM = 3; // mm in last 2 days
export const WET_72H_MM = 6; // mm in last 3 days
export const WET_5D_MM = 8; // mm over last 5 days
export const BIG_RAIN_DAY_MM = 10; // mm in a single day

// Optional: if the user marked watering recently, avoid recommending watering again too soon.
export const MIN_DAYS_BETWEEN_WATERING = 2; // days

// Seasonality (NL-ish defaults): plants need less water in winter and more in summer.
export function getSeasonFactor(date = new Date()): number {
  const m = date.getMonth(); // 0=Jan ... 11=Dec

  // Dec-Feb
  if (m === 11 || m === 0 || m === 1) return 0.3;
  // Mar
  if (m === 2) return 0.6;
  // Apr
  if (m === 3) return 0.8;
  // May
  if (m === 4) return 1.0;
  // Jun-Aug
  if (m === 5 || m === 6 || m === 7) return 1.2;
  // Sep
  if (m === 8) return 1.0;
  // Oct
  if (m === 9) return 0.7;
  // Nov
  return 0.5;
}

const safeNum = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

/**
 * Calculate watering advice based on recent and upcoming rain.
 *
 * Inputs:
 * - rainLast7: total mm over the last 7 days (historical)
 * - rainLast2Days / rainLast3Days: recent rain totals to model soil wetness
 * - rainLast5Days: total mm over last 5 days
 * - maxDailyRainLast7: max single-day rain in last 7 days
 * - rainNext3: total mm expected over the next 3 days
 * - dailyForecastNext5: [{ date, rainMm }] for the next ~5 days
 * - lastWateredDate: Date | null (optional, from user history)
 */
export function calculateWateringAdvice({
  rainLast7,
  rainLast2Days = 0,
  rainLast3Days = 0,
  rainLast5Days = 0,
  maxDailyRainLast7 = 0,
  rainNext3,
  dailyForecastNext5,
  lastWateredDate = null,
}: {
  rainLast7: number;
  rainLast2Days?: number;
  rainLast3Days?: number;
  rainLast5Days?: number;
  maxDailyRainLast7?: number;
  rainNext3: number;
  dailyForecastNext5: Array<{ date: Date | string | null; rainMm: number }>;
  lastWateredDate?: Date | null;
}) {
  const _rainLast7 = safeNum(rainLast7);
  const _rainLast2 = safeNum(rainLast2Days);
  const _rainLast3 = safeNum(rainLast3Days);
  const _rainLast5 = safeNum(rainLast5Days);
  const _maxDailyRain = safeNum(maxDailyRainLast7);
  const _rainNext3 = safeNum(rainNext3);

  const forecast = Array.isArray(dailyForecastNext5) ? dailyForecastNext5 : [];

  const seasonFactor = getSeasonFactor();
  const weeklyTarget = WEEKLY_TARGET * seasonFactor;

  const weeklyRainCoverage = _rainLast7 + _rainNext3;
  const deficitLitersPerM2 = Math.max(0, weeklyTarget - weeklyRainCoverage);

  // --- Helper: days since last watering ---
  const daysSinceLastWatering = (() => {
    if (!(lastWateredDate instanceof Date) || Number.isNaN(lastWateredDate.getTime())) return null;
    const now = new Date();
    const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startLast = new Date(
      lastWateredDate.getFullYear(),
      lastWateredDate.getMonth(),
      lastWateredDate.getDate(),
    );
    const diffMs = startToday.getTime() - startLast.getTime();
    return Math.floor(diffMs / (24 * 60 * 60 * 1000));
  })();

  // Shared return fields for all paths
  const debugFields = {
    rainLast7: _rainLast7,
    rainLast2Days: _rainLast2,
    rainLast3Days: _rainLast3,
    rainLast5Days: _rainLast5,
    maxDailyRainLast7: _maxDailyRain,
    rainNext3: _rainNext3,
    dailyForecastNext5: forecast,
    daysSinceLastWatering,
    seasonFactor,
    weeklyTarget,
  };

  // --- 0) Wet-soil gate: recent rain means no watering ---
  if (
    _rainLast2 >= WET_48H_MM ||
    _rainLast3 >= WET_72H_MM ||
    _rainLast5 >= WET_5D_MM ||
    _maxDailyRain >= BIG_RAIN_DAY_MM
  ) {
    return {
      shouldWater: false,
      noWaterReason: "recent_rain" as const,
      bestWateringDate: null,
      weeklyRainCoverage,
      deficitLitersPerM2,
      message: "No watering needed — the soil is likely still wet from recent rain.",
      ...debugFields,
    };
  }

  // --- 0b) Watering cooldown gate (optional, based on user history) ---
  if (daysSinceLastWatering !== null && daysSinceLastWatering < MIN_DAYS_BETWEEN_WATERING) {
    return {
      shouldWater: false,
      noWaterReason: "recent_watering" as const,
      bestWateringDate: null,
      weeklyRainCoverage,
      deficitLitersPerM2,
      message: "No watering needed — you watered recently and the soil should still be moist.",
      ...debugFields,
    };
  }

  // --- 1) Weekly target logic ---
  let shouldWater = false;
  let noWaterReason: "recent_rain" | "upcoming_rain" | "recent_watering" | null = null;
  let bestWateringDate: Date | string | null = null;
  let message = "";

  if (_rainLast7 >= weeklyTarget) {
    shouldWater = false;
    noWaterReason = "recent_rain";
    message = "No watering needed — the plants already received enough rain this week.";
  } else if (weeklyRainCoverage >= weeklyTarget) {
    shouldWater = false;
    noWaterReason = "upcoming_rain";
    message = "No watering needed — enough rain is expected in the coming days.";
  } else {
    shouldWater = true;
    noWaterReason = null;

    // Pick earliest "dry" day in next 5 days
    const dryDay = forecast.find((day) => safeNum(day?.rainMm) < DRY_DAY_THRESHOLD);
    bestWateringDate = dryDay?.date ?? forecast[0]?.date ?? null;

    message = `Rain is not sufficient this week. Watering recommended: about ${deficitLitersPerM2.toFixed(
      0,
    )} L per m².`;
  }

  return {
    shouldWater,
    noWaterReason,
    bestWateringDate,
    weeklyRainCoverage,
    deficitLitersPerM2,
    message,
    ...debugFields,
  };
}
