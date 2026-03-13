import { useCallback, useEffect, useRef, useState } from "react";
import { calculateWateringAdvice } from "@shared/wateringLogic";
import {
  fetchForecastForCity,
  extractRainDataFromForecast,
  geocodeCity,
} from "../api/openWeatherClient";
import { fetchRainHistory, fetchDailyRainHistory } from "../api/openMeteoClient";

export function useWeatherAdvice(locationName, lastWateredDate) {
  const [advice, setAdvice] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  const [dailyForecastNext5, setDailyForecastNext5] = useState([]);
  const [historicalDailyRain, setHistoricalDailyRain] = useState([]);
  const [retryCount, setRetryCount] = useState(0);

  const retry = useCallback(() => setRetryCount((c) => c + 1), []);

  // Keep a ref so the recalculation effect always sees the latest value
  // without re-triggering the fetch effect.
  const lastWateredDateRef = useRef(lastWateredDate);
  lastWateredDateRef.current = lastWateredDate;

  // Cached weather inputs — needed to recalculate advice when lastWateredDate changes.
  const weatherInputsRef = useRef(null);

  // Fetch weather data only when location or retryCount changes.
  useEffect(() => {
    const controller = new AbortController();
    const { signal } = controller;

    async function load() {
      try {
        setIsLoading(true);
        setError(null);

        const { lat, lon } = await geocodeCity(locationName, signal);

        const { rainLast7Total, rainLast2Days, rainLast3Days, rainLast5Days, maxDailyRainLast7, tempLast7 } =
          await fetchRainHistory(lat, lon, signal);

        const dailyHistory = await fetchDailyRainHistory(lat, lon, 30, signal);
        setHistoricalDailyRain(dailyHistory || []);

        const forecast = await fetchForecastForCity(locationName, signal);

        const {
          rainNext3,
          dailyForecastNext5: dailyForecastNext5FromApi,
        } = extractRainDataFromForecast(forecast);

        setDailyForecastNext5(dailyForecastNext5FromApi || []);

        const inputs = {
          rainLast7: rainLast7Total,
          rainLast2Days,
          rainLast3Days,
          rainLast5Days,
          maxDailyRainLast7,
          rainNext3,
          dailyForecastNext5: dailyForecastNext5FromApi,
          tempLast7,
          latitude: lat,
        };
        weatherInputsRef.current = inputs;

        setAdvice(calculateWateringAdvice({ ...inputs, lastWateredDate: lastWateredDateRef.current }));
      } catch (err) {
        if (err.name === "AbortError") return;
        console.error(err);
        setError(err.message || "Failed to load weather data.");
      } finally {
        if (!signal.aborted) {
          setIsLoading(false);
        }
      }
    }

    load();

    return () => { controller.abort(); };
  }, [locationName, retryCount]);

  // Recalculate advice without re-fetching when lastWateredDate changes.
  useEffect(() => {
    if (!weatherInputsRef.current) return;
    setAdvice(calculateWateringAdvice({ ...weatherInputsRef.current, lastWateredDate }));
  }, [lastWateredDate]);

  return { advice, isLoading, error, retry, dailyForecastNext5, historicalDailyRain };
}
