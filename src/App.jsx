// src/App.jsx
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { format, isAfter, parseISO } from "date-fns";
import { t } from "./i18n";

import { BestDayToWaterScreen } from "./components/BestDayToWaterScreen";
import { CalendarScreen } from "./components/CalendarScreen";
import { PruningScreen, detectWaterCategory } from "./components/PruningScreen";
import { SettingsScreen, getSoilMultiplier } from "./components/SettingsScreen";
import { OnboardingCarousel } from "./components/OnboardingCarousel";

import { useAuth } from "./hooks/useAuth";
import { usePushNotifications } from "./hooks/usePushNotifications";
import { useWeatherAdvice } from "./hooks/useWeatherAdvice";
import { geocodeCity, reverseGeocode } from "./api/openWeatherClient";
import { supabase } from "./supabaseClient";

import "./styles/globals.css";

// --- Helpers for garden / herbs plants ---
function loadGardenPlants() {
  try { return JSON.parse(localStorage.getItem("gardenPlants") ?? "[]") || []; }
  catch { return []; }
}
function saveGardenPlants(plants) {
  try { localStorage.setItem("gardenPlants", JSON.stringify(plants)); } catch { /* ignore */ }
}
/** One-time migration: assign waterCategory to plants that don't have one yet. */
function migrateCategories(plants) {
  let changed = false;
  const migrated = plants.map((p) => {
    if (!p.waterCategory) {
      changed = true;
      return { ...p, waterCategory: detectWaterCategory(p) };
    }
    return p;
  });
  if (changed) saveGardenPlants(migrated);
  return migrated;
}

/**
 * Refresh pruning_months (and description) for existing garden plants from the
 * plant_species table. Runs silently on startup so corrections we make to the
 * canonical data automatically reach users without them having to re-add plants.
 * Only updates plants that have a perenual_id and where the data has changed.
 */
async function refreshPruningMonthsFromDB(plants, onUpdated) {
  const ids = plants.map((p) => p.perenualId).filter(Boolean);
  if (ids.length === 0) return;

  const { data, error } = await supabase
    .from("plant_species")
    .select("id, pruning_months, description, image_url")
    .in("id", ids);

  if (error || !data?.length) return;

  const byId = Object.fromEntries(data.map((r) => [r.id, r]));
  let changed = false;
  const updated = plants.map((p) => {
    const fresh = byId[p.perenualId];
    if (!fresh) return p;
    const monthsChanged =
      JSON.stringify(p.pruningMonths ?? []) !== JSON.stringify(fresh.pruning_months ?? []);
    const descChanged = fresh.description && fresh.description !== p.description;
    const imageChanged = fresh.image_url && fresh.image_url !== p.imageUrl;
    if (!monthsChanged && !descChanged && !imageChanged) return p;
    changed = true;
    return {
      ...p,
      ...(monthsChanged ? { pruningMonths: fresh.pruning_months } : {}),
      ...(descChanged   ? { description:   fresh.description }   : {}),
      ...(imageChanged  ? { imageUrl:      fresh.image_url }     : {}),
    };
  });

  if (changed) {
    saveGardenPlants(updated);
    onUpdated(updated);
  }
}

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

  // --- Onboarding ---
  const [showOnboarding, setShowOnboarding] = useState(
    () => !localStorage.getItem("onboardingDone")
  );

  function handleOnboardingComplete() {
    localStorage.setItem("onboardingDone", "1");
    setShowOnboarding(false);
    if (!localStorage.getItem("selectedLocation")) {
      setActiveTab("settings");
    }
  }

  // --- Soil type (persisted to localStorage) ---
  const [soilType, setSoilType] = useState(() => {
    return localStorage.getItem("soilType") || "unknown";
  });

  function handleSoilTypeChange(newSoilType) {
    setSoilType(newSoilType);
    localStorage.setItem("soilType", newSoilType);
  }

  // --- Sensitivity (persisted to localStorage, integer −50…+50) ---
  const [sensitivity, setSensitivity] = useState(() => {
    const stored = localStorage.getItem("wateringSensitivity");
    return stored !== null ? parseInt(stored, 10) : 0;
  });

  function handleSensitivityChange(value) {
    setSensitivity(value);
    localStorage.setItem("wateringSensitivity", String(value));
  }

  const soilMultiplier = getSoilMultiplier(soilType);
  const sensitivityFactor = 1.0 + sensitivity / 100;

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
  const [locationLat, setLocationLat] = useState(() => {
    const stored = localStorage.getItem("selectedLocationLat");
    return stored ? parseFloat(stored) : null;
  });

  // --- Calendar month state ---
  const [currentMonth, setCurrentMonth] = useState(() => new Date());

  // --- Garden + herbs plants (for per-category home screen advice) ---
  const [gardenPlants, setGardenPlants] = useState(() => migrateCategories(loadGardenPlants()));

  // Refresh plant lists when navigating back to the home tab.
  useEffect(() => {
    if (activeTab === "best") {
      setGardenPlants(migrateCategories(loadGardenPlants()));
    }
  }, [activeTab]);

  // --- Hooks ---
  const { userId, ensureAuthUserId } = useAuth();
  const { pushEnabled, pushLoading, handleTogglePush } = usePushNotifications(userId, ensureAuthUserId);
  const { advice, weatherInputs, isLoading, error, retry, dailyForecastNext5, historicalDailyRain } = useWeatherAdvice(
    locationName, lastWateredDate, { soilMultiplier, sensitivityFactor }
  );

  // Silently refresh pruning months from plant_species once after auth,
  // so corrections to the canonical data reach users without re-adding plants.
  useEffect(() => {
    if (!userId) return;
    const current = loadGardenPlants();
    if (current.length === 0) return;
    refreshPruningMonthsFromDB(current, (updated) => {
      setGardenPlants(updated);
    });
  }, [userId]);

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

        setLocationLat(lat);
        localStorage.setItem("selectedLocationLat", String(lat));

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

  function handleRequestLocation() {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const name = await reverseGeocode(pos.coords.latitude, pos.coords.longitude);
          if (name) handleLocationChange(name);
        } catch {
          // silently ignore — user can set location in Settings
        }
      },
      () => {} // denied — user can set location in Settings
    );
  }

  function handleToggleWateredDay(date) {
    const key = format(date, "yyyy-MM-dd");
    const newValue = !wateringHistory[key];
    setWateringHistory((prev) => ({ ...prev, [key]: newValue }));
    syncWateringSession(userId, key, newValue);
  }

  if (showOnboarding) {
    return (
      <OnboardingCarousel
        lang={lang}
        onComplete={handleOnboardingComplete}
        onRequestLocation={handleRequestLocation}
        onRequestPush={() => handleTogglePush(true)}
      />
    );
  }

  return (
    <div className="app">
      <main className="content">
        {activeTab === "best" && (
          <BestDayToWaterScreen
            advice={advice}
            weatherInputs={weatherInputs}
            gardenPlants={gardenPlants}
            lastWateredDate={lastWateredDate}
            wateringHistory={wateringHistory}
            onToggleWateredDay={handleToggleWateredDay}
            dailyForecastNext5={dailyForecastNext5}
            isLoading={isLoading}
            error={error}
            onRetry={retry}
            soilMultiplier={soilMultiplier}
            sensitivityFactor={sensitivityFactor}
            lang={lang}
            onSetLang={handleSetLang}
            locationName={locationName}
          />
        )}

        {activeTab === "pruning" && (
          <PruningScreen
            userId={userId}
            onSyncPlants={syncPlants}
            lang={lang}
            latitude={locationLat}
          />
        )}

        {activeTab === "settings" && (
          <SettingsScreen
            locationName={locationName}
            onLocationChange={handleLocationChange}
            soilType={soilType}
            onSoilTypeChange={handleSoilTypeChange}
            sensitivity={sensitivity}
            onSensitivityChange={handleSensitivityChange}
            pushEnabled={pushEnabled}
            pushIsLoading={pushLoading}
            onTogglePush={handleTogglePush}
            lang={lang}
            onSetLang={handleSetLang}
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
        <button
          type="button"
          className={
            activeTab === "settings"
              ? "tab-bar-button tab-bar-button--active"
              : "tab-bar-button"
          }
          onClick={() => setActiveTab("settings")}
        >
          <span className="tab-icon">⚙️</span>
          <span className="tab-label">{t(lang, "tabSettings")}</span>
        </button>
      </nav>
    </div>
  );
}
