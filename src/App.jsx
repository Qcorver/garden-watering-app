// src/App.jsx
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { format, isAfter, parseISO } from "date-fns";
import { t } from "./i18n";

import { BestDayToWaterScreen } from "./components/BestDayToWaterScreen";
import { CalendarScreen } from "./components/CalendarScreen";
import { PruningScreen } from "./components/PruningScreen";

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

async function syncWateringSession(userId, key, active) {
  if (!userId) return;
  if (active) {
    const { error } = await supabase
      .from("watering_sessions")
      .upsert({ user_id: userId, watered_on: key }, { onConflict: "user_id,watered_on" });
    if (error) console.error("[watering] upsert failed", error);
  } else {
    const { error } = await supabase
      .from("watering_sessions")
      .delete()
      .match({ user_id: userId, watered_on: key });
    if (error) console.error("[watering] delete failed", error);
  }
}

export default function App() {
  const [activeTab, setActiveTab] = useState("best");

  // --- Language (persisted to localStorage) ---
  const [lang, setLang] = useState(() => {
    const stored = localStorage.getItem("lang");
    if (stored) return stored;
    return navigator.language?.startsWith("nl") ? "nl" : "en";
  });

  function handleSetLang(newLang) {
    setLang(newLang);
    localStorage.setItem("lang", newLang);
  }

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
    return localStorage.getItem("selectedLocation") || "";
  });

  const location = { name: locationName, type: "saved" };

  // --- Calendar month state ---
  const [currentMonth, setCurrentMonth] = useState(() => new Date());

  // --- Hooks ---
  const { userId, ensureAuthUserId } = useAuth();
  const { pushEnabled, pushLoading, handleTogglePush } = usePushNotifications(userId, ensureAuthUserId);
  const { advice, isLoading, error, retry, dailyForecastNext5, historicalDailyRain } = useWeatherAdvice(locationName, lastWateredDate);

  // --- Sync garden plants to Supabase (for pruning push notifications) ---
  const syncPlants = useCallback(
    async (plants) => {
      if (!userId) return;
      const rows = plants.map((p) => ({
        id: p.id,
        user_id: userId,
        perenual_id: p.perenualId ?? null,
        common_name: p.commonName,
        scientific_name: p.scientificName ?? null,
        pruning_months: p.pruningMonths ?? [],
        image_url: p.imageUrl ?? null,
        sunlight: p.sunlight ?? [],
        cycle: p.cycle ?? null,
        maintenance: p.maintenance ?? null,
        light_condition: p.lightCondition ?? "sun",
        in_pot: p.inPot ?? false,
        description: p.description ?? null,
        updated_at: new Date().toISOString(),
      }));

      if (rows.length > 0) {
        const { error } = await supabase
          .from("garden_plants")
          .upsert(rows, { onConflict: "id" });
        if (error) console.error("[plants] upsert failed", error);
      }

      const keepIds = plants.map((p) => p.id);
      const deleteQ = supabase
        .from("garden_plants")
        .delete()
        .eq("user_id", userId);
      const { error: delError } = keepIds.length > 0
        ? await deleteQ.not("id", "in", `(${keepIds.map((id) => `"${id}"`).join(",")})`)
        : await deleteQ;
      if (delError) console.error("[plants] delete failed", delError);
    },
    [userId]
  );

  // Load watering sessions from Supabase on first auth and merge with localStorage
  useEffect(() => {
    if (!userId) return;

    async function loadSessions() {
      const { data, error } = await supabase
        .from("watering_sessions")
        .select("watered_on")
        .eq("user_id", userId);
      if (error) {
        console.error("[watering] load failed", error);
        return;
      }
      if (!data || data.length === 0) return;
      setWateringHistory((prev) => {
        const merged = { ...prev };
        data.forEach(({ watered_on }) => { merged[watered_on] = true; });
        return merged;
      });
    }

    loadSessions();
  }, [userId]);

  // Sync lang preference to Supabase so push-daily can send localised notifications
  useEffect(() => {
    if (!userId) return;
    supabase
      .from("user_preferences")
      .upsert({ user_id: userId, lang }, { onConflict: "user_id" });
  }, [userId, lang]);

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
            { user_id: userId, name: locationName, lat, lon },
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
    const newValue = !wateringHistory[key];
    setWateringHistory((prev) => ({ ...prev, [key]: newValue }));
    syncWateringSession(userId, key, newValue);
  }

  return (
    <div className="app">
      <main className="content">
        {activeTab === "best" && (
          <BestDayToWaterScreen
            location={location}
            locationName={locationName}
            onLocationChange={handleLocationChange}
            advice={advice}
            dailyForecastNext5={dailyForecastNext5}
            isLoading={isLoading}
            error={error}
            onRetry={retry}
            pushEnabled={pushEnabled}
            pushIsLoading={pushLoading}
            onTogglePush={handleTogglePush}
            lang={lang}
            onSetLang={handleSetLang}
          />
        )}

        {activeTab === "pruning" && (
          <PruningScreen
            userId={userId}
            onSyncPlants={syncPlants}
            lang={lang}
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
            onRetry={retry}
            lang={lang}
          />
        )}
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
          <span className="tab-icon">💧</span>
          <span className="tab-label">{t(lang, "tabBestDay")}</span>
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
          <span className="tab-icon">📅</span>
          <span className="tab-label">{t(lang, "tabCalendar")}</span>
        </button>
        <button
          type="button"
          className={
            activeTab === "pruning"
              ? "tab-bar-button tab-bar-button--active"
              : "tab-bar-button"
          }
          onClick={() => setActiveTab("pruning")}
        >
          <span className="tab-icon">
            <img src="/hedgetrimmer3.png" alt="Pruning" width="22" height="22" style={{objectFit: "contain"}} />
          </span>
          <span className="tab-label">{t(lang, "tabPruning")}</span>
        </button>
      </nav>
    </div>
  );
}
