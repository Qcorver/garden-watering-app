import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  calculateWateringAdvice,
  getSeasonFactor,
  WEEKLY_TARGET,
  WET_48H_MM,
  WET_72H_MM,
  WET_5D_MM,
  BIG_RAIN_DAY_MM,
  MIN_DAYS_BETWEEN_WATERING,
  DRY_DAY_THRESHOLD,
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
    it("says no watering needed when rainLast7 already meets weekly target", () => {
      // weeklyTarget = 24 in July
      const result = calculateWateringAdvice(dryInputs({ rainLast7: 25 }));
      expect(result.shouldWater).toBe(false);
      expect(result.noWaterReason).toBe("recent_rain");
      expect(result.message).toContain("enough rain this week");
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
    it("picks the first dry day from the forecast", () => {
      const forecast = makeForecast([
        { daysFromNow: 0, rainMm: 5 },  // rainy
        { daysFromNow: 1, rainMm: 3 },  // rainy
        { daysFromNow: 2, rainMm: 0 },  // dry ← should pick this
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
});
