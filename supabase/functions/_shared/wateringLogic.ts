// Canonical watering logic — shared between frontend and push-daily edge function.
// If you change this file, both consumers pick up the change automatically.

// ---------- i18n messages ----------

type Lang = "en" | "nl";

const MESSAGES = {
  en: {
    recentRain: "No watering needed — the soil is likely still wet from recent rain.",
    recentWatering: "No watering needed — you watered recently and the soil should still be moist.",
    weeklyRain: "No watering needed — accumulated rainfall this week has adequately moistened the soil.",
    upcomingRain: "No watering needed — enough rain is expected in the coming days.",
    negligibleDeficit: "No watering needed — the remaining water deficit is negligible.",
    waterNeeded: (min: number) =>
      `Rain is not sufficient this week. Watering recommended: about ${min} min per m².`,
  },
  nl: {
    recentRain: "Geen besproeiing nodig — de grond is waarschijnlijk nog nat van de recente regen.",
    recentWatering: "Geen besproeiing nodig — je hebt recent gesproeid en de grond zou nog vochtig moeten zijn.",
    weeklyRain: "Geen besproeiing nodig — de neerslag deze week heeft de grond voldoende bevochtigd.",
    upcomingRain: "Geen besproeiing nodig — er wordt de komende dagen voldoende regen verwacht.",
    negligibleDeficit: "Geen besproeiing nodig — het resterende vochttekort is verwaarloosbaar.",
    waterNeeded: (min: number) =>
      `Te weinig regen deze week. Sproeien aanbevolen: ongeveer ${min} min per m².`,
  },
} satisfies Record<Lang, {
  recentRain: string;
  recentWatering: string;
  weeklyRain: string;
  upcomingRain: string;
  negligibleDeficit: string;
  waterNeeded: (min: number) => string;
}>;

// Baseline weekly water target (mm). Used only as fallback when no temperature data is available.
export const WEEKLY_TARGET = 20; // mm

// Used to pick a good watering day from the forecast
export const DRY_DAY_THRESHOLD = 1; // mm

// Assumed watering application rate for converting mm deficit → minutes.
// 7.5 L/min per m² based on measured hose output of 2L per 16s.
export const WATERING_RATE_L_PER_MIN = 7.5; // L/min per m²

// Water applied per user-marked watering session (mm ≈ L/m²). Counted toward
// the weekly budget so a session two days ago still reduces today's deficit.
export const ASSUMED_WATERING_MM = 10;

// "Soil likely still wet" gates (tweakable). Scaled by seasonFactor at runtime.
export const WET_48H_MM = 3; // mm in last 2 days
export const WET_72H_MM = 6; // mm in last 3 days
export const WET_5D_MM = 8; // mm over last 5 days
export const BIG_RAIN_DAY_MM = 10; // mm in a single day

// Optional: if the user marked watering recently, avoid recommending watering again too soon.
export const MIN_DAYS_BETWEEN_WATERING = 2; // days

// ---------- Plant watering categories ----------

// multiplier ~ FAO crop coefficient plus a margin for shallow-rooted crops;
// soilIndependent: potting soil is unrelated to the garden's soil type.
export const CATEGORIES = {
  vegetable: { multiplier: 1.35, rainEfficiency: 1.0, soilIndependent: false },
  border:    { multiplier: 1.0,  rainEfficiency: 1.0, soilIndependent: false },
  drought:   { multiplier: 0.35, rainEfficiency: 1.0, soilIndependent: false },
  trees:     { multiplier: 0.1,  rainEfficiency: 1.0, soilIndependent: false },
  pots:      { multiplier: 1.5,  rainEfficiency: 0.4, soilIndependent: true },
} as const;

export type CategoryKey = keyof typeof CATEGORIES;

/** Per-category params for calculateWateringAdvice, with the garden soil
 *  multiplier neutralised for categories that don't grow in garden soil. */
export function getCategoryAdviceParams(key: CategoryKey, soilMultiplier: number) {
  const { multiplier, rainEfficiency, soilIndependent } = CATEGORIES[key];
  return {
    weeklyTargetMultiplier: multiplier,
    rainEfficiency,
    soilMultiplier: soilIndependent ? 1.0 : soilMultiplier,
  };
}

/**
 * Auto-detect watering category from plant fields.
 * Priority: inPot > tree cycle > low maintenance > annual/biennial > border (default).
 */
export function detectWaterCategory(plant: {
  inPot?: boolean | null;
  cycle?: string | null;
  maintenance?: string | null;
}): CategoryKey {
  if (plant.inPot) return "pots";
  const cycle = (plant.cycle ?? "").toLowerCase();
  const maintenance = (plant.maintenance ?? "").toLowerCase();
  if (cycle.includes("tree")) return "trees";
  if (maintenance === "low") return "drought";
  if (cycle.includes("annual") || cycle.includes("biennial")) return "vegetable";
  return "border";
}

// ---------- Soil types ----------

// Multipliers on the weekly water target per soil type: sandy soil drains
// faster (needs more water), clay and peat retain moisture (need less).
export const SOIL_MULTIPLIERS = {
  unknown: 1.0,
  sandy: 1.3,
  loamy: 1.0,
  clay: 0.7,
  chalky: 1.1,
  peat: 0.6,
} as const;

export type SoilType = keyof typeof SOIL_MULTIPLIERS;

export function getSoilMultiplier(soilType: string | null | undefined): number {
  return SOIL_MULTIPLIERS[(soilType ?? "unknown") as SoilType] ?? 1.0;
}

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

/** Forecast day rain for decision-making: probability-weighted amount when
 *  available (expectedRainMm), otherwise the raw forecast amount. */
export function expectedRainMm(day: { rainMm?: number; expectedRainMm?: number } | null | undefined): number {
  return safeNum(day?.expectedRainMm ?? day?.rainMm);
}

/**
 * Pick the best day to water: the start of the longest consecutive stretch of
 * dry days (< DRY_DAY_THRESHOLD mm) in the forecast. Watering at the start of
 * a long dry spell keeps the soil moist for as long as possible. Ties go to
 * the earlier stretch; if no dry day exists, falls back to the first forecast day.
 */
export function pickBestDryDay(
  forecast: Array<{ date: Date | string | null; rainMm: number; expectedRainMm?: number }>,
): Date | string | null {
  if (!Array.isArray(forecast) || forecast.length === 0) return null;
  let bestStart = -1;
  let bestLen = 0;
  let curStart = -1;
  let curLen = 0;
  for (let i = 0; i < forecast.length; i++) {
    if (expectedRainMm(forecast[i]) < DRY_DAY_THRESHOLD) {
      if (curLen === 0) curStart = i;
      curLen++;
      if (curLen > bestLen) {
        bestLen = curLen;
        bestStart = curStart;
      }
    } else {
      curLen = 0;
    }
  }
  return bestStart >= 0
    ? forecast[bestStart]?.date ?? null
    : forecast[0]?.date ?? null;
}

/**
 * Calculate watering advice based on recent and upcoming rain.
 *
 * Inputs:
 * - rainLast7: total mm over the last 7 days (historical)
 * - rainLast2Days / rainLast3Days: recent rain totals to model soil wetness
 * - rainLast5Days: total mm over last 5 days
 * - maxDailyRainLast7: max single-day rain in last 7 days
 * - rainNext3: total mm expected over the next 3 days (callers should pass the
 *   probability-weighted total so uncertain rain doesn't fully count)
 * - dailyForecastNext5: [{ date, rainMm, expectedRainMm? }] for the next ~5 days;
 *   expectedRainMm (probability-weighted) is preferred for decisions when present
 * - lastWateredDate: Date | null (optional, from user history)
 * - wateringDaysLast7: number of user-marked watering days in the 7 days before
 *   the reference day — each counts ASSUMED_WATERING_MM toward the weekly budget
 * - tempLast7: [{ date, tmax, tmin }] — if provided with latitude, drives ET₀-based weeklyTarget
 * - tempNext5: [{ date, tmax, tmin }] — forecast temps; when hotter than last 7 days, raises weeklyTarget
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
  wateringDaysLast7 = 0,
  referenceDate = null,
  tempLast7 = [],
  tempNext5 = [],
  latitude = null,
  lang = "en",
  weeklyTargetMultiplier = 1.0,
  rainEfficiency = 1.0,
  soilMultiplier = 1.0,
  sensitivityFactor = 1.0,
}: {
  rainLast7: number;
  rainLast2Days?: number;
  rainLast3Days?: number;
  rainLast5Days?: number;
  maxDailyRainLast7?: number;
  rainNext3: number;
  dailyForecastNext5: Array<{ date: Date | string | null; rainMm: number; expectedRainMm?: number }>;
  lastWateredDate?: Date | null;
  wateringDaysLast7?: number;
  referenceDate?: Date | null;
  tempLast7?: Array<{ date: Date; tmax: number; tmin: number }>;
  tempNext5?: Array<{ date: Date; tmax: number; tmin: number }>;
  latitude?: number | null;
  lang?: Lang;
  weeklyTargetMultiplier?: number;
  rainEfficiency?: number;
  soilMultiplier?: number;
  sensitivityFactor?: number;
}) {
  const _rainLast7 = safeNum(rainLast7) * rainEfficiency;
  const _rainLast2 = safeNum(rainLast2Days) * rainEfficiency;
  const _rainLast3 = safeNum(rainLast3Days) * rainEfficiency;
  const _rainLast5 = safeNum(rainLast5Days) * rainEfficiency;
  const _maxDailyRain = safeNum(maxDailyRainLast7) * rainEfficiency;
  const _rainNext3 = safeNum(rainNext3) * rainEfficiency;

  const forecast = Array.isArray(dailyForecastNext5) ? dailyForecastNext5 : [];
  const msg = MESSAGES[lang] ?? MESSAGES.en;

  const seasonFactor = getSeasonFactor();
  // Use ET₀-based target when temperature + latitude are available; fall back to season factor.
  // Also compute a forward ET₀ target from forecast temps — if a hot dry week is coming,
  // use whichever is higher so plants aren't under-watered after a cool wet period.
  const backwardTarget =
    tempLast7 && tempLast7.length > 0 && latitude !== null
      ? computeWeeklyTarget(tempLast7, latitude)
      : WEEKLY_TARGET * seasonFactor;
  const forwardTarget =
    tempNext5 && tempNext5.length > 0 && latitude !== null
      ? computeWeeklyTarget(tempNext5, latitude)
      : 0;
  const baseWeeklyTarget = Math.max(backwardTarget, forwardTarget);
  const weeklyTarget = baseWeeklyTarget * weeklyTargetMultiplier * soilMultiplier * sensitivityFactor;

  // Wet-soil gate scaling: how fast soil dries depends on climate (ET₀) and soil
  // type, but NOT on how much a plant category demands or on the user's
  // sensitivity slider — those only scale the weekly target, never "is the
  // soil wet". This keeps gates correct in both hemispheres (high ET₀ = high
  // factor regardless of calendar month).
  const wetGateFactor = (baseWeeklyTarget * soilMultiplier) / WEEKLY_TARGET;

  // Water the user applied themselves counts toward the weekly budget, so a
  // session earlier this week keeps reducing the deficit after the cooldown.
  const wateringContribution = Math.max(0, safeNum(wateringDaysLast7)) * ASSUMED_WATERING_MM;
  const suppliedLast7 = _rainLast7 + wateringContribution;
  const weeklyRainCoverage = suppliedLast7 + _rainNext3;
  const deficitLitersPerM2 = Math.max(0, weeklyTarget - weeklyRainCoverage);
  const deficitMinutesPerM2 = Math.round(deficitLitersPerM2 / WATERING_RATE_L_PER_MIN);

  // --- Helper: days since last watering ---
  const daysSinceLastWatering = (() => {
    if (!(lastWateredDate instanceof Date) || Number.isNaN(lastWateredDate.getTime())) return null;
    const ref = (referenceDate instanceof Date && !Number.isNaN(referenceDate.getTime()))
      ? referenceDate
      : new Date();
    const startToday = new Date(ref.getFullYear(), ref.getMonth(), ref.getDate());
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
    wateringContribution,
    seasonFactor,
    weeklyTarget,
  };

  // --- 0) Wet-soil gate: recent rain means no watering ---
  const scaledWet48hMm = WET_48H_MM * wetGateFactor;
  const scaledWet72hMm = WET_72H_MM * wetGateFactor;
  const scaledWet5dMm = WET_5D_MM * wetGateFactor;
  const scaledBigRainDayMm = BIG_RAIN_DAY_MM * wetGateFactor;

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
      message: msg.recentRain,
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
      message: msg.recentWatering,
      ...debugFields,
    };
  }

  // --- 1) Weekly target logic ---
  let shouldWater = false;
  let noWaterReason:
    | "recent_rain"
    | "upcoming_rain"
    | "recent_watering"
    | "weekly_rain"
    | "negligible_deficit"
    | null = null;
  let bestWateringDate: Date | string | null = null;
  let message = "";

  // 80% of weekly target from rain + own watering is sufficient: the small remaining
  // deficit is within the soil's moisture buffer, especially with low evapotranspiration.
  if (suppliedLast7 >= weeklyTarget * 0.8) {
    shouldWater = false;
    noWaterReason = "weekly_rain";
    message = msg.weeklyRain;
  } else if (weeklyRainCoverage >= weeklyTarget) {
    shouldWater = false;
    noWaterReason = "upcoming_rain";
    message = msg.upcomingRain;
  } else if (deficitMinutesPerM2 === 0) {
    // Deficit exists but rounds to 0 minutes — not worth watering.
    shouldWater = false;
    noWaterReason = "negligible_deficit";
    message = msg.negligibleDeficit;
  } else {
    shouldWater = true;
    noWaterReason = null;

    // Water at the start of the longest dry stretch in the forecast.
    bestWateringDate = pickBestDryDay(forecast);

    message = msg.waterNeeded(deficitMinutesPerM2);
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
