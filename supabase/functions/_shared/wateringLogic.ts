// Canonical watering logic — shared between frontend and push-daily edge function.
// If you change this file, both consumers pick up the change automatically.

// Baseline weekly water target (mm). Used only as fallback when no temperature data is available.
export const WEEKLY_TARGET = 20; // mm

// Used to pick a good watering day from the forecast
export const DRY_DAY_THRESHOLD = 1; // mm

// Assumed watering application rate for converting mm deficit → minutes.
// 7.5 L/min per m² based on measured hose output of 2L per 16s.
export const WATERING_RATE_L_PER_MIN = 7.5; // L/min per m²

// "Soil likely still wet" gates (tweakable). Scaled by seasonFactor at runtime.
export const WET_48H_MM = 3; // mm in last 2 days
export const WET_72H_MM = 6; // mm in last 3 days
export const WET_5D_MM = 8; // mm over last 5 days
export const BIG_RAIN_DAY_MM = 10; // mm in a single day

// Optional: if the user marked watering recently, avoid recommending watering again too soon.
export const MIN_DAYS_BETWEEN_WATERING = 2; // days

// Seasonality fallback (used when no temperature data available).
export function getSeasonFactor(date = new Date()): number {
  const m = date.getMonth(); // 0=Jan ... 11=Dec

  if (m === 11 || m === 0 || m === 1) return 0.3; // Dec-Feb
  if (m === 2) return 0.6;  // Mar
  if (m === 3) return 0.8;  // Apr
  if (m === 4) return 1.0;  // May
  if (m === 5 || m === 6 || m === 7) return 1.2; // Jun-Aug
  if (m === 8) return 1.0;  // Sep
  if (m === 9) return 0.7;  // Oct
  return 0.5; // Nov
}

// ---------- ET₀ (Hargreaves-Samani) ----------

/** Day of year (1–365). */
function getDayOfYear(date: Date): number {
  const start = new Date(date.getFullYear(), 0, 0);
  return Math.floor((date.getTime() - start.getTime()) / (24 * 60 * 60 * 1000));
}

/**
 * Extraterrestrial radiation Ra [MJ/m²/day] (FAO-56 eq. 21).
 * @param latDeg  Latitude in decimal degrees (positive = north)
 * @param dayOfYear  Day of year (1–365)
 */
export function computeRa(latDeg: number, dayOfYear: number): number {
  const Gsc = 0.0820; // solar constant [MJ/m²/min]
  const phi = (Math.PI / 180) * latDeg;
  const dr = 1 + 0.033 * Math.cos((2 * Math.PI * dayOfYear) / 365);
  const delta = 0.409 * Math.sin((2 * Math.PI * dayOfYear) / 365 - 1.39);
  const wsArg = Math.max(-1, Math.min(1, -Math.tan(phi) * Math.tan(delta)));
  const omegaS = Math.acos(wsArg);
  return (
    ((24 * 60) / Math.PI) *
    Gsc *
    dr *
    (omegaS * Math.sin(phi) * Math.sin(delta) +
      Math.cos(phi) * Math.cos(delta) * Math.sin(omegaS))
  );
}

/**
 * Daily reference evapotranspiration ET₀ [mm/day] via Hargreaves-Samani.
 * Ra × 0.408 converts MJ/m²/day → mm/day (÷ latent heat of vaporisation 2.45 MJ/kg).
 */
export function computeDailyET0(tmax: number, tmin: number, ra: number): number {
  const Tmean = (tmax + tmin) / 2;
  const deltaT = Math.max(0, tmax - tmin);
  return Math.max(0, 0.0023 * ra * 0.408 * (Tmean + 17.8) * Math.sqrt(deltaT));
}

/**
 * Weekly water target [mm/week] derived from actual temperature data.
 * Averages daily ET₀ over the supplied days, multiplies by 7, floors at 2 mm.
 * Falls back to WEEKLY_TARGET × getSeasonFactor() when no data is available.
 */
export function computeWeeklyTarget(
  tempLast7: Array<{ date: Date; tmax: number; tmin: number }>,
  latitude: number,
): number {
  if (!tempLast7 || tempLast7.length === 0) {
    return WEEKLY_TARGET * getSeasonFactor();
  }
  const et0Sum = tempLast7.reduce((sum, { date, tmax, tmin }) => {
    const d = date instanceof Date ? date : new Date(date);
    return sum + computeDailyET0(tmax, tmin, computeRa(latitude, getDayOfYear(d)));
  }, 0);
  return Math.max(2, (et0Sum / tempLast7.length) * 7);
}

// ---------- main advice ----------

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
 * - tempLast7: [{ date, tmax, tmin }] — if provided with latitude, drives ET₀-based weeklyTarget
 * - latitude: decimal degrees — required to use ET₀-based target
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
  tempLast7 = [],
  latitude = null,
}: {
  rainLast7: number;
  rainLast2Days?: number;
  rainLast3Days?: number;
  rainLast5Days?: number;
  maxDailyRainLast7?: number;
  rainNext3: number;
  dailyForecastNext5: Array<{ date: Date | string | null; rainMm: number }>;
  lastWateredDate?: Date | null;
  tempLast7?: Array<{ date: Date; tmax: number; tmin: number }>;
  latitude?: number | null;
}) {
  const _rainLast7 = safeNum(rainLast7);
  const _rainLast2 = safeNum(rainLast2Days);
  const _rainLast3 = safeNum(rainLast3Days);
  const _rainLast5 = safeNum(rainLast5Days);
  const _maxDailyRain = safeNum(maxDailyRainLast7);
  const _rainNext3 = safeNum(rainNext3);

  const forecast = Array.isArray(dailyForecastNext5) ? dailyForecastNext5 : [];

  const seasonFactor = getSeasonFactor();
  // Use ET₀-based target when temperature + latitude are available; fall back to season factor.
  const weeklyTarget =
    tempLast7 && tempLast7.length > 0 && latitude !== null
      ? computeWeeklyTarget(tempLast7, latitude)
      : WEEKLY_TARGET * seasonFactor;

  // Derive effective season factor from the actual weekly target so wet-soil gates work
  // correctly in both hemispheres and for any climate (not just Northern Hemisphere months).
  const effectiveSeasonFactor = weeklyTarget / WEEKLY_TARGET;

  const weeklyRainCoverage = _rainLast7 + _rainNext3;
  const deficitLitersPerM2 = Math.max(0, weeklyTarget - weeklyRainCoverage);
  const deficitMinutesPerM2 = Math.round(deficitLitersPerM2 / WATERING_RATE_L_PER_MIN);

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
  // Thresholds scale with effectiveSeasonFactor derived from the actual weeklyTarget.
  // This is globally correct: a hot Sydney summer gives a high factor regardless of
  // calendar month, and a cold July anywhere gives a low factor automatically.
  const scaledWet48hMm = WET_48H_MM * effectiveSeasonFactor;
  const scaledWet72hMm = WET_72H_MM * effectiveSeasonFactor;
  const scaledWet5dMm = WET_5D_MM * effectiveSeasonFactor;
  const scaledBigRainDayMm = BIG_RAIN_DAY_MM * effectiveSeasonFactor;

  if (
    _rainLast2 >= scaledWet48hMm ||
    _rainLast3 >= scaledWet72hMm ||
    _rainLast5 >= scaledWet5dMm ||
    _maxDailyRain >= scaledBigRainDayMm
  ) {
    return {
      shouldWater: false,
      noWaterReason: "recent_rain" as const,
      bestWateringDate: null,
      weeklyRainCoverage,
      deficitLitersPerM2,
      deficitMinutesPerM2,
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
      deficitMinutesPerM2,
      message: "No watering needed — you watered recently and the soil should still be moist.",
      ...debugFields,
    };
  }

  // --- 1) Weekly target logic ---
  let shouldWater = false;
  let noWaterReason: "recent_rain" | "upcoming_rain" | "recent_watering" | null = null;
  let bestWateringDate: Date | string | null = null;
  let message = "";

  // 80% of weekly target from rain alone is sufficient: the small remaining deficit is within
  // the soil's moisture buffer, especially with low evapotranspiration in cool weather.
  if (_rainLast7 >= weeklyTarget * 0.8) {
    shouldWater = false;
    noWaterReason = "recent_rain";
    message = "No watering needed — accumulated rainfall this week has adequately moistened the soil.";
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

    message = `Rain is not sufficient this week. Watering recommended: about ${deficitMinutesPerM2} min per m².`;
  }

  return {
    shouldWater,
    noWaterReason,
    bestWateringDate,
    weeklyRainCoverage,
    deficitLitersPerM2,
    deficitMinutesPerM2,
    message,
    ...debugFields,
  };
}
