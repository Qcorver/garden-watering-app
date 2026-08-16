// src/App.jsx
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { format, isAfter, parseISO, addDays } from "date-fns";
import { t } from "./i18n";

import { BestDayToWaterScreen } from "./components/BestDayToWaterScreen";
import { CalendarScreen } from "./components/CalendarScreen";
import { detectWaterCategory } from "./components/PruningScreen";
import { MijnTuinScreen } from "./components/MijnTuinScreen";
import { CATEGORIES, calculateWateringAdvice, getCategoryAdviceParams } from "@shared/wateringLogic";
import { SettingsScreen, getSoilMultiplier } from "./components/SettingsScreen";
import { OnboardingCarousel } from "./components/OnboardingCarousel";

import { Capacitor } from "@capacitor/core";
import { PushNotifications } from "@capacitor/push-notifications";

import { useAuth } from "./hooks/useAuth";
import { usePushNotifications } from "./hooks/usePushNotifications";
import { useWeatherAdvice } from "./hooks/useWeatherAdvice";
import { geocodeCity, reverseGeocode } from "./api/openWeatherClient";
import { supabase } from "./supabaseClient";

import "./styles/globals.css";

// --- Helpers for garden / herbs plants ---
function loadGardenPlants() {
  try {
    const parsed = JSON.parse(localStorage.getItem("gardenPlants") ?? "[]");
    // Guard against a corrupted array (non-array, or null/primitive entries):
    // downstream code does p.waterCategory / detectWaterCategory(p) during the
    // very first render, so a single bad entry would white-screen the app.
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((p) => p && typeof p === "object");
  } catch { return []; }
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
    .select("id, pruning_months, description, image_url, maintenance, cycle")
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
    const maintenanceChanged = fresh.maintenance && fresh.maintenance !== p.maintenance;
    const cycleChanged = fresh.cycle && fresh.cycle !== p.cycle;
    if (!monthsChanged && !descChanged && !imageChanged && !maintenanceChanged && !cycleChanged) return p;
    changed = true;
    const patched = {
      ...p,
      ...(monthsChanged     ? { pruningMonths: fresh.pruning_months } : {}),
      ...(descChanged       ? { description:   fresh.description }    : {}),
      ...(imageChanged      ? { imageUrl:      fresh.image_url }      : {}),
      ...(maintenanceChanged ? { maintenance:  fresh.maintenance }    : {}),
      ...(cycleChanged      ? { cycle:         fresh.cycle }          : {}),
    };
    if (maintenanceChanged || cycleChanged) {
      patched.waterCategory = detectWaterCategory(patched);
    }
    return patched;
  });

  if (changed) {
    saveGardenPlants(updated);
    onUpdated(updated);
  }
}

function hasMoestuinPlantsInStorage() {
  try { return (JSON.parse(localStorage.getItem("moestuinPlants") ?? "[]") || []).length > 0; }
  catch { return false; }
}

// --- Helpers for watering history ---
// Entries older than this are dropped on load so localStorage doesn't grow
// unbounded. The algorithm only looks back 7 days; the calendar 1 month.
const HISTORY_RETENTION_DAYS = 90;

function historyRetentionCutoff() {
  return format(addDays(new Date(), -HISTORY_RETENTION_DAYS), "yyyy-MM-dd");
}

// date-fns format() throws a RangeError on an Invalid Date, which would crash
// the whole render (white screen). Returns a Date only when parseable, else null
// so hot paths can skip a malformed weather-data entry instead of throwing.
function toValidDate(value) {
  if (!value) return null; // treat null/undefined/"" as invalid (new Date(null) → epoch!)
  const d = value instanceof Date ? value : new Date(value);
  return isNaN(d.getTime()) ? null : d;
}

function loadWateringHistory() {
  try {
    const raw = localStorage.getItem("wateringHistory");
    const parsed = raw ? JSON.parse(raw) : {};
    const cutoff = historyRetentionCutoff();
    const pruned = {};
    for (const [key, value] of Object.entries(parsed)) {
      if (key >= cutoff) pruned[key] = value;
    }
    return pruned;
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

// Count watering days in the 7 days before refDate (exclusive). Matches the
// rainLast7 window, which also excludes the reference day itself; watering on
// the reference day is handled by the cooldown gate instead.
function countWateringDaysLast7(wateredKeys, refDate = new Date()) {
  const from = format(addDays(refDate, -7), "yyyy-MM-dd");
  const to = format(refDate, "yyyy-MM-dd");
  let count = 0;
  for (const key of wateredKeys) {
    if (key >= from && key < to) count++;
  }
  return count;
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

  const wateredDayKeys = useMemo(
    () => Object.keys(wateringHistory).filter((d) => wateringHistory[d]),
    [wateringHistory]
  );

  const wateringDaysLast7 = useMemo(
    () => countWateringDaysLast7(wateredDayKeys),
    [wateredDayKeys]
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

  // Moestuin crops count toward the vegetable watering category.
  const [hasMoestuinPlants, setHasMoestuinPlants] = useState(hasMoestuinPlantsInStorage);

  // Deep link from a moestuin check-in push: plant to open in the detail sheet.
  const [moestuinFocusId, setMoestuinFocusId] = useState(null);

  // Refresh plant lists when navigating back to the home tab.
  useEffect(() => {
    if (activeTab === "best") {
      setGardenPlants(migrateCategories(loadGardenPlants()));
      setHasMoestuinPlants(hasMoestuinPlantsInStorage());
    }
  }, [activeTab]);

  // Tapping a moestuin check-in notification opens that plant's status sheet.
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    let handle;
    PushNotifications.addListener("pushNotificationActionPerformed", (action) => {
      const data = action?.notification?.data ?? {};
      if (data.kind === "moestuin_checkin" && data.plant_id) {
        setMoestuinFocusId(data.plant_id);
        setActiveTab("garden");
      }
    }).then((h) => { handle = h; });
    return () => { handle?.remove(); };
  }, []);

  // --- Hooks ---
  const { userId, ensureAuthUserId } = useAuth();
  const { pushEnabled, pushLoading, handleTogglePush } = usePushNotifications(userId, ensureAuthUserId);
  const { advice, weatherInputs, isLoading, error, retry, dailyForecastNext5, currentWeatherMain, historicalDailyRain } = useWeatherAdvice(
    locationName, lastWateredDate, { soilMultiplier, sensitivityFactor, wateringDaysLast7 }
  );

  // Forward-simulate watering needs for upcoming forecast days.
  // For each forecast day D, rebuild the 7-day rain window from historical + forecast data
  // and run the algorithm. lastWateredDate cascades: if day N is recommended, day N+1 knows.
  const wateringScheduleDates = useMemo(() => {
    if (!weatherInputs || !historicalDailyRain?.length || !dailyForecastNext5?.length) return new Set();

    const rainMap = new Map();
    historicalDailyRain.forEach(({ date, rainMm }) => {
      const d = toValidDate(date);
      if (d) rainMap.set(format(d, "yyyy-MM-dd"), rainMm ?? 0);
    });
    // Forecast days use probability-weighted rain so uncertain showers don't
    // suppress future watering days the way certain rain would.
    dailyForecastNext5.forEach(({ date, rainMm, expectedRainMm }) => {
      const d = toValidDate(date);
      if (d) rainMap.set(format(d, "yyyy-MM-dd"), expectedRainMm ?? rainMm ?? 0);
    });

    const getRain = (d) => rainMap.get(format(d, "yyyy-MM-dd")) ?? 0;

    // Temperature per date (historical + forecast) so each simulated day D gets
    // its own ET₀ window instead of reusing today's historical tempLast7. During
    // a heatwave the forecast temps raise the weekly target for future days.
    const futTemps = weatherInputs.tempNext5 ?? [];
    const tempMap = new Map();
    [...(weatherInputs.tempLast7 ?? []), ...futTemps].forEach((t) => {
      const d = toValidDate(t.date);
      if (d) tempMap.set(format(d, "yyyy-MM-dd"), { ...t, date: d });
    });

    const schedule = new Set();
    let simLastWateredDate = lastWateredDate; // Carry actual + simulated waterings forward
    const simWateredKeys = [...wateredDayKeys]; // Actual + simulated watering days for budget counting

    for (const fd of dailyForecastNext5) {
      const D = toValidDate(fd.date);
      if (!D) continue; // skip a malformed forecast entry rather than crashing
      const last7 = Array.from({ length: 7 }, (_, i) => getRain(addDays(D, i - 7)));

      const dStr = format(D, "yyyy-MM-dd");
      const simInputs = {
        ...weatherInputs,
        rainLast7: last7.reduce((s, v) => s + v, 0),
        rainLast2Days: last7[5] + last7[6],
        rainLast3Days: last7[4] + last7[5] + last7[6],
        rainLast5Days: last7[2] + last7[3] + last7[4] + last7[5] + last7[6],
        maxDailyRainLast7: Math.max(...last7),
        rainNext3: [0, 1, 2].map((i) => getRain(addDays(D, i))).reduce((s, v) => s + v, 0),
        // Filter forecast to start from D so bestWateringDate is picked relative to D, not today
        dailyForecastNext5: (weatherInputs.dailyForecastNext5 ?? []).filter((f) => {
          const fdDate = toValidDate(f.date);
          return fdDate ? format(fdDate, "yyyy-MM-dd") >= dStr : false;
        }),
        // Rebuild the temperature windows from D's perspective (mix of historical + forecast)
        tempLast7: Array.from({ length: 7 }, (_, i) =>
          tempMap.get(format(addDays(D, i - 7), "yyyy-MM-dd"))
        ).filter(Boolean),
        tempNext5: futTemps.filter((tf) => {
          const td = toValidDate(tf.date);
          return td ? format(td, "yyyy-MM-dd") >= dStr : false;
        }),
        lastWateredDate: simLastWateredDate,
        wateringDaysLast7: countWateringDaysLast7(simWateredKeys, D),
        referenceDate: D,
        soilMultiplier,
        sensitivityFactor,
      };

      const bestStr = (d) => {
        const vd = toValidDate(d);
        return vd ? format(vd, "yyyy-MM-dd") : null;
      };

      // Only mark day D if the algorithm recommends watering ON D specifically (i.e. D is the
      // best day from D's perspective). This keeps the calendar in sync with Tab 1 which shows
      // bestWateringDate, not just any day where shouldWater=true.
      //
      // Mirror Tab 1's decision exactly: when the user has plants, decide purely from
      // per-category advice — never mix in the generic multiplier-1.0 garden advice, which
      // would mark days green that Tab 1 (category-only) never shows. Only fall back to the
      // generic garden advice when no plant categories are present.
      let needsWater = false;
      const seenCats = new Set();
      for (const plant of gardenPlants) {
        const cat = plant.waterCategory ?? detectWaterCategory(plant);
        if (CATEGORIES[cat]) seenCats.add(cat);
      }
      if (hasMoestuinPlants) seenCats.add("vegetable");
      for (const cat of seenCats) {
        const catAdvice = calculateWateringAdvice({ ...simInputs, ...getCategoryAdviceParams(cat, soilMultiplier) });
        if (catAdvice.shouldWater && bestStr(catAdvice.bestWateringDate) === dStr) {
          needsWater = true;
          break;
        }
      }

      if (seenCats.size === 0) {
        const mainAdvice = calculateWateringAdvice(simInputs);
        needsWater = mainAdvice.shouldWater && bestStr(mainAdvice.bestWateringDate) === dStr;
      }

      if (needsWater) {
        schedule.add(dStr);
        simLastWateredDate = D; // Future days know this day was watered
        simWateredKeys.push(dStr);
      }
    }

    return schedule;
  }, [weatherInputs, historicalDailyRain, dailyForecastNext5, gardenPlants, hasMoestuinPlants, lastWateredDate, wateredDayKeys, soilMultiplier, sensitivityFactor]);

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

  // --- Sync wishlist plants to Supabase (for planting push notifications) ---
  const syncWishlistPlants = useCallback(
    async (plants) => {
      if (!userId) return;
      const rows = plants.map((p) => ({
        id: p.id,
        user_id: userId,
        perenual_id: p.perenualId ?? null,
        common_name: p.commonName,
        scientific_name: p.scientificName ?? null,
        planting_months: p.plantingMonths ?? [],
        image_url: p.imageUrl ?? null,
        cycle: p.cycle ?? null,
        updated_at: new Date().toISOString(),
      }));

      if (rows.length > 0) {
        const { error } = await supabase
          .from("wishlist_plants")
          .upsert(rows, { onConflict: "id" });
        if (error) console.error("[wishlist] upsert failed", error);
      }

      const keepIds = plants.map((p) => p.id);
      const deleteQ = supabase
        .from("wishlist_plants")
        .delete()
        .eq("user_id", userId);
      const { error: delError } = keepIds.length > 0
        ? await deleteQ.not("id", "in", `(${keepIds.map((id) => `"${id}"`).join(",")})`)
        : await deleteQ;
      if (delError) console.error("[wishlist] delete failed", delError);
    },
    [userId]
  );

  // --- Sync moestuin plants to Supabase (for growth check-in push notifications) ---
  const syncMoestuinPlants = useCallback(
    async (plants) => {
      setHasMoestuinPlants(plants.length > 0);
      if (!userId) return;
      const rows = plants.map((p) => ({
        id: p.id,
        user_id: userId,
        crop_id: p.cropId ?? null,
        common_name: p.nameNl ?? p.nameEn ?? "?",
        sown_on: p.sownOn ?? null,
        germinated_on: p.germinatedOn ?? null,
        planted_out_on: p.plantedOutOn ?? null,
        first_harvest_on: p.firstHarvestOn ?? null,
        updated_at: new Date().toISOString(),
      }));

      if (rows.length > 0) {
        const { error } = await supabase
          .from("moestuin_plants")
          .upsert(rows, { onConflict: "id" });
        if (error) console.error("[moestuin] upsert failed", error);
      }

      const keepIds = plants.map((p) => p.id);
      const deleteQ = supabase
        .from("moestuin_plants")
        .delete()
        .eq("user_id", userId);
      const { error: delError } = keepIds.length > 0
        ? await deleteQ.not("id", "in", `(${keepIds.map((id) => `"${id}"`).join(",")})`)
        : await deleteQ;
      if (delError) console.error("[moestuin] delete failed", delError);
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
        .eq("user_id", userId)
        .gte("watered_on", historyRetentionCutoff());
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

  // Sync preferences to Supabase so push-daily uses the same language, soil
  // type and sensitivity as the app (they otherwise only live in localStorage).
  useEffect(() => {
    if (!userId) return;
    supabase
      .from("user_preferences")
      .upsert(
        { user_id: userId, lang, soil_type: soilType, sensitivity },
        { onConflict: "user_id" }
      );
  }, [userId, lang, soilType, sensitivity]);

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
            wateringScheduleDates={wateringScheduleDates}
            gardenPlants={gardenPlants}
            hasMoestuinPlants={hasMoestuinPlants}
            wateringHistory={wateringHistory}
            lastWateredDate={lastWateredDate}
            wateringDaysLast7={wateringDaysLast7}
            onToggleWateredDay={handleToggleWateredDay}
            dailyForecastNext5={dailyForecastNext5}
            currentWeatherMain={currentWeatherMain}
            isLoading={isLoading}
            error={error}
            onRetry={retry}
            soilMultiplier={soilMultiplier}
            sensitivityFactor={sensitivityFactor}
            lang={lang}
            onSetLang={handleSetLang}
            locationName={locationName}
            onGoToSettings={() => setActiveTab("settings")}
          />
        )}

        {activeTab === "garden" && (
          <MijnTuinScreen
            userId={userId}
            onSyncPlants={syncPlants}
            onSyncWishlistPlants={syncWishlistPlants}
            onSyncMoestuinPlants={syncMoestuinPlants}
            focusMoestuinPlantId={moestuinFocusId}
            onMoestuinFocusHandled={() => setMoestuinFocusId(null)}
            lang={lang}
            latitude={locationLat}
            gardenPlants={gardenPlants}
            hasMoestuinPlants={hasMoestuinPlants}
            advice={advice}
            locationName={locationName}
            soilType={soilType}
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
            wateringScheduleDates={wateringScheduleDates}
            dailyForecastNext5={dailyForecastNext5}
            historicalDailyRain={historicalDailyRain}
            wateringHistory={wateringHistory}
            onToggleWateredDay={handleToggleWateredDay}
            currentMonth={currentMonth}
            onMonthChange={setCurrentMonth}
            isLoading={isLoading}
            error={error}
            onRetry={retry}
            locationName={locationName}
            onGoToSettings={() => setActiveTab("settings")}
            lang={lang}
          />
        )}
      </main>

      <nav className="tab-bar tabs">
        <button
          type="button"
          className={activeTab === "best" ? "tab-bar-button tab-bar-button--active" : "tab-bar-button"}
          onClick={() => setActiveTab("best")}
        >
          <span className="tab-icon">💧</span>
          <span className="tab-label">{t(lang, "tabBestDay")}</span>
        </button>
        <button
          type="button"
          className={activeTab === "calendar" ? "tab-bar-button tab-bar-button--active" : "tab-bar-button"}
          onClick={() => setActiveTab("calendar")}
        >
          <span className="tab-icon">📅</span>
          <span className="tab-label">{t(lang, "tabCalendar")}</span>
        </button>
        <button
          type="button"
          className={activeTab === "garden" ? "tab-bar-button tab-bar-button--active" : "tab-bar-button"}
          onClick={() => setActiveTab("garden")}
        >
          <span className="tab-icon">🪴</span>
          <span className="tab-label">{t(lang, "tabGarden")}</span>
        </button>
        <button
          type="button"
          className={activeTab === "settings" ? "tab-bar-button tab-bar-button--active" : "tab-bar-button"}
          onClick={() => setActiveTab("settings")}
        >
          <span className="tab-icon">⚙️</span>
          <span className="tab-label">{t(lang, "tabSettings")}</span>
        </button>
      </nav>
    </div>
  );
}
