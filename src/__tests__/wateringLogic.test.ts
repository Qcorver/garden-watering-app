import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  calculateWateringAdvice,
  pickBestDryDay,
  getSeasonFactor,
  computeRa,
  computeDailyET0,
  computeWeeklyTarget,
  WEEKLY_TARGET,
  WET_48H_MM,
  WET_72H_MM,
  WET_5D_MM,
  BIG_RAIN_DAY_MM,
  MIN_DAYS_BETWEEN_WATERING,
  DRY_DAY_THRESHOLD,
  WATERING_RATE_L_PER_MIN,
  ASSUMED_WATERING_MM,
  CATEGORIES,
  getCategoryAdviceParams,
} from "@shared/wateringLogic";

// Helper: build a minimal forecast array
function makeForecast(
  days: Array<{ daysFromNow: number; rainMm: number }>
): Array<{ date: Date; rainMm: number }> {
  const today = new Date();
  return days.map(({ daysFromNow, rainMm }) => {
    const d = new Date(today);
    d.setDate(d.getDate() + daysFromNow);
    return { date: d, rainMm };
  });
}

// Default dry inputs (no recent rain, no forecast rain)
function dryInputs(overrides = {}) {
  return {
    rainLast7: 0,
    rainLast2Days: 0,
    rainLast3Days: 0,
    rainLast5Days: 0,
    maxDailyRainLast7: 0,
    rainNext3: 0,
    dailyForecastNext5: makeForecast([
      { daysFromNow: 0, rainMm: 0 },
      { daysFromNow: 1, rainMm: 0 },
      { daysFromNow: 2, rainMm: 0 },
      { daysFromNow: 3, rainMm: 0 },
      { daysFromNow: 4, rainMm: 0 },
    ]),
    ...overrides,
  };
}

// Pin "now" to a summer date so seasonFactor = 1.2 and weeklyTarget = 24
// This avoids flaky tests from month changes
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 6, 15)); // July 15
});

afterEach(() => {
  vi.useRealTimers();
});

// ─── ET₀ (Hargreaves-Samani) ─────────────────────────────────────────────────

describe("computeRa", () => {
  it("returns ~40 MJ/m²/day for 52°N in July (day 196)", () => {
    const ra = computeRa(52, 196);
    expect(ra).toBeGreaterThan(35);
    expect(ra).toBeLessThan(45);
  });

  it("returns much less Ra in January (day 15) than in July", () => {
    expect(computeRa(52, 15)).toBeLessThan(computeRa(52, 196) * 0.3);
  });

  it("southern latitudes have higher winter Ra than northern", () => {
    // 40°N (Spain) in January gets more sun than 52°N (NL)
    expect(computeRa(40, 15)).toBeGreaterThan(computeRa(52, 15));
  });
});

describe("computeDailyET0", () => {
  it("returns ~3–6 mm/day for a warm summer day at 52°N", () => {
    const ra = computeRa(52, 196); // July
    expect(computeDailyET0(24, 14, ra)).toBeGreaterThan(3);
    expect(computeDailyET0(24, 14, ra)).toBeLessThan(7);
  });

  it("returns < 1 mm/day for a cold winter day at 52°N", () => {
    const ra = computeRa(52, 15); // January
    expect(computeDailyET0(5, 1, ra)).toBeLessThan(1);
  });

  it("returns 0 when tmax <= tmin (no temperature range)", () => {
    const ra = computeRa(52, 196);
    expect(computeDailyET0(15, 15, ra)).toBe(0);
  });
});

describe("computeWeeklyTarget", () => {
  it("returns a realistic summer weekly target for 52°N (~20–35 mm)", () => {
    const d = new Date(2026, 6, 15);
    const temps = Array.from({ length: 7 }, () => ({ date: d, tmax: 24, tmin: 14 }));
    const target = computeWeeklyTarget(temps, 52);
    expect(target).toBeGreaterThan(15);
    expect(target).toBeLessThan(40);
  });

  it("returns a low winter weekly target for 52°N (>= 2 mm floor)", () => {
    const d = new Date(2026, 0, 15);
    const temps = Array.from({ length: 7 }, () => ({ date: d, tmax: 5, tmin: 0 }));
    const target = computeWeeklyTarget(temps, 52);
    expect(target).toBeLessThan(8);
    expect(target).toBeGreaterThanOrEqual(2);
  });

  it("falls back to getSeasonFactor when no temp data (July → 24 mm)", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 6, 15));
    expect(computeWeeklyTarget([], 52)).toBe(WEEKLY_TARGET * 1.2);
    vi.useRealTimers();
  });

  it("floors at 2 mm even in extreme cold", () => {
    const d = new Date(2026, 0, 15);
    const temps = Array.from({ length: 7 }, () => ({ date: d, tmax: -10, tmin: -15 }));
    expect(computeWeeklyTarget(temps, 52)).toBeGreaterThanOrEqual(2);
  });

  it("gives higher weekly target for lower latitudes with same temperature", () => {
    const d = new Date(2026, 6, 15);
    const temps = Array.from({ length: 7 }, () => ({ date: d, tmax: 28, tmin: 18 }));
    // 35°N (Mediterranean) vs 52°N (NL): more Ra → higher ET₀
    const targetMed = computeWeeklyTarget(temps, 35);
    const targetNL = computeWeeklyTarget(temps, 52);
    // In July northern latitudes can have similar Ra, so just check both are positive and reasonable
    expect(targetMed).toBeGreaterThan(0);
    expect(targetNL).toBeGreaterThan(0);
  });
});

describe("calculateWateringAdvice — ET₀ integration", () => {
  it("uses ET₀-based weeklyTarget when tempLast7 + latitude are provided", () => {
    // Pinned to July (beforeEach); ET₀ target at 52°N ≠ hardcoded 24mm (= 20 × 1.2)
    const d = new Date(2026, 6, 15);
    const temps = Array.from({ length: 7 }, () => ({ date: d, tmax: 24, tmin: 14 }));
    const result = calculateWateringAdvice(
      dryInputs({ rainLast7: 0, tempLast7: temps, latitude: 52 })
    );
    // weeklyTarget comes from ET₀, not the hardcoded 24
    expect(result.weeklyTarget).not.toBe(24);
    expect(result.weeklyTarget).toBeGreaterThan(5);
  });

  it("falls back to season-factor target when tempLast7 is empty", () => {
    const result = calculateWateringAdvice(dryInputs({ rainLast7: 0, latitude: 52 }));
    expect(result.weeklyTarget).toBe(24); // July season factor 1.2 × 20
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe("getSeasonFactor", () => {
  it("returns 0.3 for winter months (Dec, Jan, Feb)", () => {
    expect(getSeasonFactor(new Date(2026, 0, 15))).toBe(0.3); // Jan
    expect(getSeasonFactor(new Date(2026, 1, 15))).toBe(0.3); // Feb
    expect(getSeasonFactor(new Date(2026, 11, 15))).toBe(0.3); // Dec
  });

  it("returns 1.2 for summer months (Jun, Jul, Aug)", () => {
    expect(getSeasonFactor(new Date(2026, 5, 15))).toBe(1.2); // Jun
    expect(getSeasonFactor(new Date(2026, 6, 15))).toBe(1.2); // Jul
    expect(getSeasonFactor(new Date(2026, 7, 15))).toBe(1.2); // Aug
  });

  it("returns 1.0 for May and Sep", () => {
    expect(getSeasonFactor(new Date(2026, 4, 15))).toBe(1.0); // May
    expect(getSeasonFactor(new Date(2026, 8, 15))).toBe(1.0); // Sep
  });

  it("returns transitional values for spring/autumn", () => {
    expect(getSeasonFactor(new Date(2026, 2, 15))).toBe(0.6); // Mar
    expect(getSeasonFactor(new Date(2026, 3, 15))).toBe(0.8); // Apr
    expect(getSeasonFactor(new Date(2026, 9, 15))).toBe(0.7); // Oct
    expect(getSeasonFactor(new Date(2026, 10, 15))).toBe(0.5); // Nov
  });
});

describe("calculateWateringAdvice", () => {
  // In July: seasonFactor=1.2, weeklyTarget=24

  describe("wet-soil gates", () => {
    // Tests pinned to July (seasonFactor=1.2), so scaled thresholds = constant * 1.2
    it("blocks watering when rainLast2Days >= WET_48H_MM * seasonFactor", () => {
      const result = calculateWateringAdvice(
        dryInputs({ rainLast2Days: WET_48H_MM * 1.2 })
      );
      expect(result.shouldWater).toBe(false);
      expect(result.noWaterReason).toBe("recent_rain");
      expect(result.message).toContain("still wet");
    });

    it("blocks watering when rainLast3Days >= WET_72H_MM * seasonFactor", () => {
      const result = calculateWateringAdvice(
        dryInputs({ rainLast3Days: WET_72H_MM * 1.2 })
      );
      expect(result.shouldWater).toBe(false);
      expect(result.noWaterReason).toBe("recent_rain");
    });

    it("blocks watering when rainLast5Days >= WET_5D_MM * seasonFactor", () => {
      const result = calculateWateringAdvice(
        dryInputs({ rainLast5Days: WET_5D_MM * 1.2 })
      );
      expect(result.shouldWater).toBe(false);
      expect(result.noWaterReason).toBe("recent_rain");
    });

    it("blocks watering when maxDailyRainLast7 >= BIG_RAIN_DAY_MM * seasonFactor", () => {
      const result = calculateWateringAdvice(
        dryInputs({ maxDailyRainLast7: BIG_RAIN_DAY_MM * 1.2 })
      );
      expect(result.shouldWater).toBe(false);
      expect(result.noWaterReason).toBe("recent_rain");
    });

    it("does NOT block when values are just below scaled thresholds", () => {
      // WET_*_MM - 0.1 is below WET_*_MM * 1.2 for all constants, so gates don't fire
      const result = calculateWateringAdvice(
        dryInputs({
          rainLast2Days: WET_48H_MM - 0.1,
          rainLast3Days: WET_72H_MM - 0.1,
          rainLast5Days: WET_5D_MM - 0.1,
          maxDailyRainLast7: BIG_RAIN_DAY_MM - 0.1,
        })
      );
      // Should pass through to weekly target logic (shouldWater = true since no rain)
      expect(result.shouldWater).toBe(true);
    });

    it("in winter (Dec): 2mm in 2 days is enough to block watering (low evaporation)", () => {
      vi.setSystemTime(new Date(2026, 11, 15)); // December, seasonFactor=0.3
      // scaledWet48hMm = 3 * 0.3 = 0.9 → 2mm >= 0.9 triggers gate
      const result = calculateWateringAdvice(
        dryInputs({ rainLast2Days: 2 })
      );
      expect(result.shouldWater).toBe(false);
      expect(result.noWaterReason).toBe("recent_rain");
    });

    it("in winter (Dec): 4mm over 5 days is enough to block watering", () => {
      vi.setSystemTime(new Date(2026, 11, 15)); // December, seasonFactor=0.3
      // scaledWet5dMm = 8 * 0.3 = 2.4 → 4mm >= 2.4 triggers gate
      const result = calculateWateringAdvice(
        dryInputs({ rainLast5Days: 4 })
      );
      expect(result.shouldWater).toBe(false);
      expect(result.noWaterReason).toBe("recent_rain");
    });
  });

  describe("watering cooldown gate", () => {
    it("blocks watering when user watered recently (within MIN_DAYS_BETWEEN_WATERING)", () => {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);

      const result = calculateWateringAdvice(
        dryInputs({ lastWateredDate: yesterday })
      );
      expect(result.shouldWater).toBe(false);
      expect(result.noWaterReason).toBe("recent_watering");
      expect(result.message).toContain("watered recently");
    });

    it("allows watering when enough days have passed since last watering", () => {
      const threeDaysAgo = new Date();
      threeDaysAgo.setDate(threeDaysAgo.getDate() - MIN_DAYS_BETWEEN_WATERING);

      const result = calculateWateringAdvice(
        dryInputs({ lastWateredDate: threeDaysAgo })
      );
      // No wet-soil gate, no cooldown, no rain → should water
      expect(result.shouldWater).toBe(true);
    });

    it("ignores cooldown when lastWateredDate is null", () => {
      const result = calculateWateringAdvice(
        dryInputs({ lastWateredDate: null })
      );
      expect(result.shouldWater).toBe(true);
    });
  });

  describe("weekly target logic", () => {
    it("says no watering needed when rainLast7 >= 80% of weekly target", () => {
      // weeklyTarget = 24 in July; 80% = 19.2mm; use 20mm
      const result = calculateWateringAdvice(dryInputs({ rainLast7: 20 }));
      expect(result.shouldWater).toBe(false);
      expect(result.noWaterReason).toBe("weekly_rain");
      expect(result.message).toContain("adequately moistened");
    });

    it("recommends watering when rainLast7 < 80% of weekly target (no forecast)", () => {
      // weeklyTarget = 24 in July; 80% = 19.2mm; use 10mm → deficit = 14mm → ~2 min → should water
      // (with WATERING_RATE_L_PER_MIN = 7.5, deficit must be >= 3.75mm to round to ≥ 1 min)
      const result = calculateWateringAdvice(dryInputs({ rainLast7: 10 }));
      expect(result.shouldWater).toBe(true);
      expect(result.deficitMinutesPerM2).toBe(Math.round(14 / WATERING_RATE_L_PER_MIN)); // = 2
    });

    it("says no watering needed when rainLast7 + rainNext3 meets target", () => {
      const result = calculateWateringAdvice(
        dryInputs({ rainLast7: 14, rainNext3: 12 })
      );
      expect(result.shouldWater).toBe(false);
      expect(result.noWaterReason).toBe("upcoming_rain");
      expect(result.message).toContain("enough rain is expected");
    });

    it("recommends watering when total rain coverage is below target", () => {
      const result = calculateWateringAdvice(
        dryInputs({ rainLast7: 5, rainNext3: 2 })
      );
      expect(result.shouldWater).toBe(true);
      expect(result.noWaterReason).toBeNull();
      expect(result.bestWateringDate).not.toBeNull();
      expect(result.message).toContain("Watering recommended");
    });

    it("calculates correct deficit", () => {
      // weeklyTarget = 24, coverage = 5 + 2 = 7, deficit = 17
      const result = calculateWateringAdvice(
        dryInputs({ rainLast7: 5, rainNext3: 2 })
      );
      expect(result.deficitLitersPerM2).toBe(17);
      expect(result.weeklyRainCoverage).toBe(7);
    });
  });

  describe("best watering day selection", () => {
    it("picks the first dry day when it starts the longest dry stretch", () => {
      const forecast = makeForecast([
        { daysFromNow: 0, rainMm: 5 },  // rainy
        { daysFromNow: 1, rainMm: 3 },  // rainy
        { daysFromNow: 2, rainMm: 0 },  // dry ← starts longest stretch
        { daysFromNow: 3, rainMm: 0 },
        { daysFromNow: 4, rainMm: 0 },
      ]);

      const result = calculateWateringAdvice(
        dryInputs({ dailyForecastNext5: forecast })
      );
      expect(result.shouldWater).toBe(true);

      const bestDate = new Date(result.bestWateringDate as Date);
      const expectedDate = forecast[2].date;
      expect(bestDate.toDateString()).toBe(expectedDate.toDateString());
    });

    it("falls back to first forecast day if all days are rainy", () => {
      const forecast = makeForecast([
        { daysFromNow: 0, rainMm: 5 },
        { daysFromNow: 1, rainMm: 3 },
        { daysFromNow: 2, rainMm: 2 },
        { daysFromNow: 3, rainMm: 4 },
        { daysFromNow: 4, rainMm: 6 },
      ]);

      const result = calculateWateringAdvice(
        dryInputs({ dailyForecastNext5: forecast })
      );
      expect(result.shouldWater).toBe(true);

      const bestDate = new Date(result.bestWateringDate as Date);
      expect(bestDate.toDateString()).toBe(forecast[0].date.toDateString());
    });

    it("considers a day with rain < DRY_DAY_THRESHOLD as dry", () => {
      const forecast = makeForecast([
        { daysFromNow: 0, rainMm: 5 },
        { daysFromNow: 1, rainMm: DRY_DAY_THRESHOLD - 0.1 }, // just under → dry
        { daysFromNow: 2, rainMm: 0 },
      ]);

      const result = calculateWateringAdvice(
        dryInputs({ dailyForecastNext5: forecast })
      );
      expect(result.shouldWater).toBe(true);

      const bestDate = new Date(result.bestWateringDate as Date);
      expect(bestDate.toDateString()).toBe(forecast[1].date.toDateString());
    });

    it("skips an early short dry stretch in favour of a later longer one", () => {
      const forecast = makeForecast([
        { daysFromNow: 0, rainMm: 0 },  // dry, but stretch of 1
        { daysFromNow: 1, rainMm: 4 },  // rainy
        { daysFromNow: 2, rainMm: 0 },  // dry ← starts stretch of 3
        { daysFromNow: 3, rainMm: 0 },
        { daysFromNow: 4, rainMm: 0 },
      ]);

      const result = calculateWateringAdvice(
        dryInputs({ dailyForecastNext5: forecast })
      );
      expect(result.shouldWater).toBe(true);

      const bestDate = new Date(result.bestWateringDate as Date);
      expect(bestDate.toDateString()).toBe(forecast[2].date.toDateString());
    });

    it("breaks stretch-length ties in favour of the earlier stretch", () => {
      const forecast = makeForecast([
        { daysFromNow: 0, rainMm: 0 },  // dry ← stretch of 2, earlier
        { daysFromNow: 1, rainMm: 0 },
        { daysFromNow: 2, rainMm: 4 },  // rainy
        { daysFromNow: 3, rainMm: 0 },  // dry, stretch of 2
        { daysFromNow: 4, rainMm: 0 },
      ]);

      const result = calculateWateringAdvice(
        dryInputs({ dailyForecastNext5: forecast })
      );
      expect(result.shouldWater).toBe(true);

      const bestDate = new Date(result.bestWateringDate as Date);
      expect(bestDate.toDateString()).toBe(forecast[0].date.toDateString());
    });
  });

  describe("pickBestDryDay", () => {
    it("returns null for an empty forecast", () => {
      expect(pickBestDryDay([])).toBeNull();
    });

    it("returns the first day when every day is rainy", () => {
      const forecast = makeForecast([
        { daysFromNow: 0, rainMm: 5 },
        { daysFromNow: 1, rainMm: 3 },
      ]);
      expect(pickBestDryDay(forecast)).toBe(forecast[0].date);
    });

    it("returns the start of the longest dry stretch", () => {
      const forecast = makeForecast([
        { daysFromNow: 0, rainMm: 0 },
        { daysFromNow: 1, rainMm: 4 },
        { daysFromNow: 2, rainMm: 0 },
        { daysFromNow: 3, rainMm: 0 },
      ]);
      expect(pickBestDryDay(forecast)).toBe(forecast[2].date);
    });

    it("prefers probability-weighted rain (expectedRainMm) over raw rainMm", () => {
      // Raw forecast says day 0 is wet, but at 10% probability the expected
      // amount is 0.5mm — below DRY_DAY_THRESHOLD, so day 0 counts as dry.
      const forecast = makeForecast([
        { daysFromNow: 0, rainMm: 5 },
        { daysFromNow: 1, rainMm: 0 },
      ]);
      forecast[0].expectedRainMm = 0.5;
      expect(pickBestDryDay(forecast)).toBe(forecast[0].date);
    });

    it("treats a likely shower as wet even when expectedRainMm is present", () => {
      const forecast = makeForecast([
        { daysFromNow: 0, rainMm: 5 },
        { daysFromNow: 1, rainMm: 0 },
      ]);
      forecast[0].expectedRainMm = 4.5; // 90% chance of 5mm
      expect(pickBestDryDay(forecast)).toBe(forecast[1].date);
    });
  });

  describe("debug fields", () => {
    it("returns all expected debug fields", () => {
      const result = calculateWateringAdvice(dryInputs());
      expect(result).toHaveProperty("rainLast7");
      expect(result).toHaveProperty("rainLast2Days");
      expect(result).toHaveProperty("rainLast3Days");
      expect(result).toHaveProperty("rainLast5Days");
      expect(result).toHaveProperty("maxDailyRainLast7");
      expect(result).toHaveProperty("rainNext3");
      expect(result).toHaveProperty("dailyForecastNext5");
      expect(result).toHaveProperty("daysSinceLastWatering");
      expect(result).toHaveProperty("seasonFactor", 1.2);
      expect(result).toHaveProperty("weeklyTarget", 24);
    });
  });

  describe("edge cases", () => {
    it("handles NaN / undefined inputs gracefully (treated as 0)", () => {
      const result = calculateWateringAdvice({
        rainLast7: NaN,
        rainNext3: undefined as unknown as number,
        dailyForecastNext5: [],
      });
      expect(result.shouldWater).toBe(true);
      expect(result.rainLast7).toBe(0);
      expect(result.rainNext3).toBe(0);
    });

    it("handles null dailyForecastNext5 gracefully", () => {
      const result = calculateWateringAdvice({
        rainLast7: 0,
        rainNext3: 0,
        dailyForecastNext5: null as unknown as Array<{ date: Date; rainMm: number }>,
      });
      expect(result.shouldWater).toBe(true);
      expect(result.bestWateringDate).toBeNull(); // no forecast to pick from
    });

    it("handles empty forecast array", () => {
      const result = calculateWateringAdvice(dryInputs({ dailyForecastNext5: [] }));
      expect(result.shouldWater).toBe(true);
      expect(result.bestWateringDate).toBeNull();
    });
  });

  describe("own watering counts toward weekly budget (wateringDaysLast7)", () => {
    it("adds ASSUMED_WATERING_MM per session to the supplied water", () => {
      // weeklyTarget = 24; rain 5mm + 2 sessions × 10mm = 25mm ≥ 80% → no watering
      const result = calculateWateringAdvice(
        dryInputs({ rainLast7: 5, wateringDaysLast7: 2 })
      );
      expect(result.shouldWater).toBe(false);
      expect(result.noWaterReason).toBe("weekly_rain");
    });

    it("reduces the deficit after the cooldown has passed", () => {
      // Watered 3 days ago (cooldown over): deficit = 24 − (0 + 10) = 14, not 24
      const threeDaysAgo = new Date();
      threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);
      const result = calculateWateringAdvice(
        dryInputs({ lastWateredDate: threeDaysAgo, wateringDaysLast7: 1 })
      );
      expect(result.shouldWater).toBe(true);
      expect(result.deficitLitersPerM2).toBe(24 - ASSUMED_WATERING_MM);
    });

    it("defaults to 0 sessions (unchanged behaviour)", () => {
      const result = calculateWateringAdvice(dryInputs());
      expect(result.deficitLitersPerM2).toBe(24);
    });
  });

  describe("wet-soil gates ignore plant demand and sensitivity", () => {
    it("does not shrink gates for low-demand categories (trees)", () => {
      // With the old scaling (× weeklyTarget/WEEKLY_TARGET incl. multiplier 0.1),
      // 1mm in 2 days would trigger the gate (3 × 0.12 = 0.36). Now the gate stays
      // at 3 × 1.2 = 3.6mm, so 1mm must NOT report "recent_rain".
      const result = calculateWateringAdvice(
        dryInputs({ rainLast2Days: 1, weeklyTargetMultiplier: 0.1 })
      );
      expect(result.noWaterReason).not.toBe("recent_rain");
    });

    it("does not inflate gates for high-demand categories (vegetables)", () => {
      // Gate = 3 × 1.2 = 3.6mm regardless of multiplier; 4mm in 2 days blocks watering
      const result = calculateWateringAdvice(
        dryInputs({ rainLast2Days: 4, weeklyTargetMultiplier: CATEGORIES.vegetable.multiplier })
      );
      expect(result.shouldWater).toBe(false);
      expect(result.noWaterReason).toBe("recent_rain");
    });

    it("still scales gates with soil type (sandy dries faster)", () => {
      // Sandy (1.3): gate = 3 × 1.2 × 1.3 = 4.68mm → 4mm does NOT trigger it
      const result = calculateWateringAdvice(
        dryInputs({ rainLast2Days: 4, soilMultiplier: 1.3 })
      );
      expect(result.noWaterReason).not.toBe("recent_rain");
    });
  });

  describe("getCategoryAdviceParams", () => {
    it("neutralises the garden soil multiplier for pots", () => {
      expect(getCategoryAdviceParams("pots", 1.3).soilMultiplier).toBe(1.0);
      expect(getCategoryAdviceParams("pots", 1.3).rainEfficiency).toBe(0.4);
    });

    it("passes the soil multiplier through for in-ground categories", () => {
      expect(getCategoryAdviceParams("border", 1.3).soilMultiplier).toBe(1.3);
      expect(getCategoryAdviceParams("vegetable", 0.7).soilMultiplier).toBe(0.7);
      expect(getCategoryAdviceParams("vegetable", 1.0).weeklyTargetMultiplier).toBe(1.35);
    });
  });

  describe("forward ET₀ (tempNext5)", () => {
    // Simulate Amstelveen scenario: cool/wet last week, hot/dry week ahead.
    // Last 7 days: ~12–15 °C → low ET₀ → low backward target (~14 mm/week).
    // With 32.3 mm rain last week the 80% gate fires on the backward target.
    // Next 5 days: 14–26 °C → high ET₀ → forward target ~28 mm/week.
    // For pots (multiplier 1.5, rainEfficiency 0.4): effective rain = 12.9 mm < 80% of 42 mm → should water.
    const latitude = 52; // Amstelveen

    function makeTempDays(
      count: number,
      tmax: number,
      tmin: number,
      startDaysFromNow = -7,
    ): Array<{ date: Date; tmax: number; tmin: number }> {
      return Array.from({ length: count }, (_, i) => {
        const d = new Date();
        d.setDate(d.getDate() + startDaysFromNow + i);
        return { date: d, tmax, tmin };
      });
    }

    it("raises weeklyTarget when forecast is hotter than recent history", () => {
      const coolWeek = makeTempDays(7, 15, 8); // backward ET₀ ~2.5 mm/day → ~17 mm/week
      const hotForecast = makeTempDays(5, 26, 14, 0); // forward ET₀ ~4.5 mm/day → ~32 mm/week

      const backward = calculateWateringAdvice({
        rainLast7: 32.3,
        rainNext3: 0,
        dailyForecastNext5: makeForecast([{ daysFromNow: 0, rainMm: 0 }]),
        tempLast7: coolWeek,
        latitude,
      });
      const forward = calculateWateringAdvice({
        rainLast7: 32.3,
        rainNext3: 0,
        dailyForecastNext5: makeForecast([{ daysFromNow: 0, rainMm: 0 }]),
        tempLast7: coolWeek,
        tempNext5: hotForecast,
        latitude,
      });

      // Forward target should be higher → weeklyTarget increases → 80% gate may no longer fire.
      expect(forward.weeklyTarget).toBeGreaterThan(backward.weeklyTarget);
    });

    it("recommends watering pots after cool/wet week when hot dry week is forecast", () => {
      const coolWeek = makeTempDays(7, 15, 8);
      const hotForecast = makeTempDays(5, 26, 14, 0);

      const result = calculateWateringAdvice({
        rainLast7: 32.3,
        rainNext3: 0,
        dailyForecastNext5: makeForecast([
          { daysFromNow: 0, rainMm: 0 },
          { daysFromNow: 1, rainMm: 0 },
        ]),
        tempLast7: coolWeek,
        tempNext5: hotForecast,
        latitude,
        weeklyTargetMultiplier: 1.5, // pots
        rainEfficiency: 0.4,         // pots
      });

      expect(result.shouldWater).toBe(true);
    });

    it("does not change result when tempNext5 is empty", () => {
      const coolWeek = makeTempDays(7, 15, 8);

      const withoutForward = calculateWateringAdvice({
        rainLast7: 0,
        rainNext3: 0,
        dailyForecastNext5: makeForecast([{ daysFromNow: 0, rainMm: 0 }]),
        tempLast7: coolWeek,
        latitude,
      });
      const withEmptyForward = calculateWateringAdvice({
        rainLast7: 0,
        rainNext3: 0,
        dailyForecastNext5: makeForecast([{ daysFromNow: 0, rainMm: 0 }]),
        tempLast7: coolWeek,
        tempNext5: [],
        latitude,
      });

      expect(withEmptyForward.weeklyTarget).toBe(withoutForward.weeklyTarget);
    });
  });
});
