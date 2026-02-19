// src/App.jsx
import React, { useEffect, useMemo, useState } from "react";
import { format, isAfter, parseISO } from "date-fns";

import { BestDayToWaterScreen } from "./components/BestDayToWaterScreen";
import { CalendarScreen } from "./components/CalendarScreen";
import LocationPicker from "./components/LocationPicker";

import { useAuth } from "./hooks/useAuth";
import { usePushNotifications } from "./hooks/usePushNotifications";
import { useWeatherAdvice } from "./hooks/useWeatherAdvice";
import { geocodeCity } from "./api/openWeatherClient";
import { supabase } from "./supabaseClient";

import "./styles/globals.css";

// --- Helpers for watering history ---
function loadWateringHistory() {
  try {
    const raw = localStorage.getItem("wateringHistory");
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveWateringHistory(history) {
  try {
    localStorage.setItem("wateringHistory", JSON.stringify(history));
  } catch {
    // ignore
  }
}

function getLastWateredDateFromHistory(wateringHistory) {
  const dates = Object.keys(wateringHistory).filter((d) => wateringHistory[d]);
  if (dates.length === 0) return null;

  let latest = parseISO(dates[0]);
  for (let i = 1; i < dates.length; i++) {
    const d = parseISO(dates[i]);
    if (isAfter(d, latest)) {
      latest = d;
    }
  }
  return latest;
}

export default function App() {
  const [activeTab, setActiveTab] = useState("best");

  // --- Watering history (persisted to localStorage) ---
  const [wateringHistory, setWateringHistory] = useState(loadWateringHistory);

  useEffect(() => {
    saveWateringHistory(wateringHistory);
  }, [wateringHistory]);

  const lastWateredDate = useMemo(
    () => getLastWateredDateFromHistory(wateringHistory),
    [wateringHistory]
  );

  // --- Location (persisted to localStorage) ---
  const [locationName, setLocationName] = useState(() => {
    return localStorage.getItem("selectedLocation") || "Amstelveen,NL";
  });

  const location = { name: locationName, type: "saved" };

  // --- Calendar month state ---
  const [currentMonth, setCurrentMonth] = useState(() => new Date());

  // --- Hooks ---
  const { userId, ensureAuthUserId } = useAuth();
  const { pushEnabled, pushLoading, handleTogglePush } = usePushNotifications(userId, ensureAuthUserId);
  const { advice, isLoading, error, dailyForecastNext5, historicalDailyRain } = useWeatherAdvice(locationName, lastWateredDate);

  // Sync location to Supabase so push-daily can look it up
  useEffect(() => {
    if (!userId || !locationName) return;

    let cancelled = false;

    async function syncLocation() {
      try {
        const { lat, lon } = await geocodeCity(locationName);
        if (cancelled) return;

        const { error: upsertError } = await supabase
          .from("user_location")
          .upsert(
            { user_id: userId, lat, lon },
            { onConflict: "user_id" }
          );

        if (upsertError) {
          console.error("[location] upsert failed", upsertError);
        }
      } catch (e) {
        console.error("[location] sync failed:", e);
      }
    }

    syncLocation();
    return () => { cancelled = true; };
  }, [userId, locationName]);

  function handleLocationChange(newLocationName) {
    if (!newLocationName || !newLocationName.trim()) return;
    const cleaned = newLocationName.trim();
    setLocationName(cleaned);
    localStorage.setItem("selectedLocation", cleaned);
  }

  function handleToggleWateredDay(date) {
    const key = format(date, "yyyy-MM-dd");
    setWateringHistory((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  }

  return (
    <div className="app">
      <main className="content">
        {activeTab === "best" && (
          <BestDayToWaterScreen
            location={location}
            advice={advice}
            isLoading={isLoading}
            error={error}
            pushEnabled={pushEnabled}
            pushIsLoading={pushLoading}
            onTogglePush={handleTogglePush}
          />
        )}

        {activeTab === "calendar" && (
          <CalendarScreen
            advice={advice}
            dailyForecastNext5={dailyForecastNext5}
            historicalDailyRain={historicalDailyRain}
            wateringHistory={wateringHistory}
            onToggleWateredDay={handleToggleWateredDay}
            currentMonth={currentMonth}
            onMonthChange={setCurrentMonth}
            isLoading={isLoading}
            error={error}
          />
        )}

        <LocationPicker
          locationName={locationName}
          onLocationChange={handleLocationChange}
        />
      </main>

      <nav className="tab-bar tabs">
        <button
          type="button"
          className={
            activeTab === "best"
              ? "tab-bar-button tab-bar-button--active"
              : "tab-bar-button"
          }
          onClick={() => setActiveTab("best")}
        >
          Best day
        </button>
        <button
          type="button"
          className={
            activeTab === "calendar"
              ? "tab-bar-button tab-bar-button--active"
              : "tab-bar-button"
          }
          onClick={() => setActiveTab("calendar")}
        >
          Calendar
        </button>
      </nav>
    </div>
  );
}
