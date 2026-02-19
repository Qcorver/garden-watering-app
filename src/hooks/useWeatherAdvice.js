import { useEffect, useState } from "react";
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

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        setIsLoading(true);
        setError(null);

        const { lat, lon } = await geocodeCity(locationName);
        if (cancelled) return;

        const { rainLast7Total, rainLast2Days, rainLast3Days, rainLast5Days, maxDailyRainLast7 } =
          await fetchRainHistory(lat, lon);
        if (cancelled) return;

        const dailyHistory = await fetchDailyRainHistory(lat, lon, 30);
        if (!cancelled) {
          setHistoricalDailyRain(dailyHistory || []);
        }

        const forecast = await fetchForecastForCity(locationName);
        if (cancelled) return;

        const {
          rainNext3,
          dailyForecastNext5: dailyForecastNext5FromApi,
        } = extractRainDataFromForecast(forecast);

        if (!cancelled) {
          setDailyForecastNext5(dailyForecastNext5FromApi || []);

          const newAdvice = calculateWateringAdvice({
            rainLast7: rainLast7Total,
            rainLast2Days,
            rainLast3Days,
            rainLast5Days,
            maxDailyRainLast7,
            rainNext3,
            dailyForecastNext5: dailyForecastNext5FromApi,
            lastWateredDate,
          });

          setAdvice(newAdvice);
        }
      } catch (err) {
        if (!cancelled) {
          console.error(err);
          setError(err.message || "Failed to load weather data.");
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    load();

    return () => { cancelled = true; };
  }, [locationName, lastWateredDate]);

  return { advice, isLoading, error, dailyForecastNext5, historicalDailyRain };
}
