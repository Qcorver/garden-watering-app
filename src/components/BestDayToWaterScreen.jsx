import React, { useMemo, useState } from "react";
import { format, isToday, isTomorrow, parseISO } from "date-fns";
import "./BestDayToWaterScreen.css";
import { PlantIllustration } from "./PlantIllustration";
import { t, getDateLocale } from "../i18n";
import { CATEGORIES, calculateWateringAdvice, getCategoryAdviceParams } from "@shared/wateringLogic";
import { detectWaterCategory, PlantThumbnail, PlantDetailPopup } from "./PruningScreen";

const CATEGORY_ORDER = ["vegetable", "border", "drought", "trees", "pots"];
const CATEGORY_ICON = { vegetable: "🥕", border: "🌸", drought: "🌵", trees: "🌳", pots: "🪴" };
const CATEGORY_LABEL_KEY = {
  vegetable: "catVegetable", border: "catBorder", drought: "catDrought",
  trees: "catTrees", pots: "catPots",
};

function InfoIcon({ onClick, dark = false }) {
  return (
    <button
      type="button"
      className={`info-icon${dark ? " info-icon--dark" : ""}`}
      onClick={onClick}
      aria-label="More info"
    >
      ⓘ
    </button>
  );
}

function InfoSheet({ title, body, onClose }) {
  return (
    <div className="best-overlay" onClick={onClose}>
      <div className="best-cat-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="best-cat-sheet-header">
          <span className="best-cat-sheet-title">{title}</span>
          <button type="button" className="pruning-sheet-close" onClick={onClose}>✕</button>
        </div>
        <div className="info-sheet-body">
          {body.split("\n\n").map((para, i) => <p key={i}>{para}</p>)}
        </div>
      </div>
    </div>
  );
}

/** Strip province/state from location string for display: "City, Province, CC" → "City, CC". */
function formatLocationDisplay(name) {
  if (!name) return name;
  const parts = name.split(",").map((s) => s.trim()).filter(Boolean);
  if (parts.length >= 3) return `${parts[0]}, ${parts[parts.length - 1]}`;
  return name;
}

/** Map OpenWeather `main` condition + daily rain total to illustration weather type.
 *  Drizzle always → cloudy (no raindrops for light mist).
 *  Rain/Thunderstorm/Snow → rain only if ≥ 1 mm fell today; otherwise cloudy. */
function getWeatherType(main, rainMm = 0) {
  if (!main) return "sunny";
  if (main === "Drizzle") return "cloudy";
  if (["Rain", "Thunderstorm", "Snow"].includes(main)) return rainMm >= 1 ? "rain" : "cloudy";
  if (main === "Clouds" || main === "Atmosphere") return "cloudy";
  return "sunny";
}

/** Derive the UI message from advice fields (keeps push notifications in English). */
function getAdviceMessage(lang, advice) {
  const { shouldWater, noWaterReason, deficitMinutesPerM2 } = advice;
  if (shouldWater) {
    return t(lang, "msgWaterNeeded", { n: deficitMinutesPerM2 });
  }
  if (noWaterReason === "recent_watering")    return t(lang, "msgRecentWatering");
  if (noWaterReason === "upcoming_rain")      return t(lang, "msgUpcomingRain");
  if (noWaterReason === "recent_rain")        return t(lang, "msgRecentRainShort");
  if (noWaterReason === "negligible_deficit") return t(lang, "msgNegligibleDeficit");
  return t(lang, "msgWeeklyRain");
}

/**
 * Water-balance breakdown behind the advice: rain fallen + own watering +
 * expected rain vs. the weekly need. Collapsible on the main screen; rendered
 * always-open inside the category sheet (collapsible=false).
 */
function WhyBreakdown({ lang, advice, collapsible = true }) {
  const [open, setOpen] = useState(!collapsible);
  if (!advice) return null;

  const {
    shouldWater,
    rainLast7,
    wateringContribution = 0,
    rainNext3,
    weeklyTarget,
    deficitLitersPerM2,
  } = advice;

  const mm = (v) => `${(Number(v) || 0).toFixed(1)} mm`;
  const deficit = Number(deficitLitersPerM2) || 0;

  // When a wet-soil or cooldown gate overrides a numeric shortfall, the numbers
  // alone look contradictory — repeat the reason inside the breakdown.
  const gateNote = !shouldWater && deficit > 0 ? getAdviceMessage(lang, advice) : null;

  const rows = [
    [t(lang, "whyRainLast7"), mm(rainLast7)],
    ...(wateringContribution > 0 ? [[t(lang, "whyWatered"), `+ ${mm(wateringContribution)}`]] : []),
    [t(lang, "whyRainNext3"), `+ ${mm(rainNext3)}`],
    [t(lang, "whyNeeded"), mm(weeklyTarget)],
  ];

  return (
    <div className="best-why">
      {collapsible ? (
        <button type="button" className="best-why-toggle" onClick={() => setOpen((o) => !o)}>
          {t(lang, "whyTitle")} <span className="best-why-chevron">{open ? "▴" : "▾"}</span>
        </button>
      ) : (
        <div className="best-why-heading">{t(lang, "whyTitle")}</div>
      )}
      {open && (
        <div className="best-why-panel">
          {rows.map(([label, value]) => (
            <div key={label} className="best-why-row">
              <span>{label}</span>
              <span className="best-why-value">{value}</span>
            </div>
          ))}
          <div className="best-why-row best-why-row--total">
            <span>{deficit > 0 ? t(lang, "whyDeficit") : t(lang, "whyCovered")}</span>
            <span className="best-why-value">{deficit > 0 ? mm(deficit) : "✓"}</span>
          </div>
          {gateNote && <div className="best-why-note">{gateNote}</div>}
        </div>
      )}
    </div>
  );
}

/**
 * @param {Object} props
 * @param {Object} props.advice   - result of calculateWateringAdvice
 * @param {Array}  props.dailyForecastNext5 - [{date, rainMm, main}, …] from OpenWeather
 * @param {boolean} props.isLoading
 * @param {string|null} props.error
 * @param {() => void} props.onRetry
 * @param {number} props.soilMultiplier - from Settings soil type selection
 * @param {number} props.sensitivityFactor - from Settings sensitivity slider
 * @param {string} props.lang - 'en' | 'nl'
 * @param {(lang: string) => void} props.onSetLang
 */
export function BestDayToWaterScreen({
  advice,
  weatherInputs = null,
  wateringScheduleDates = null,
  gardenPlants = [],
  hasMoestuinPlants = false,
  wateringHistory = {},
  lastWateredDate = null,
  wateringDaysLast7 = 0,
  onToggleWateredDay,
  dailyForecastNext5 = [],
  currentWeatherMain = null,
  isLoading,
  error,
  onRetry,
  soilMultiplier = 1.0,
  sensitivityFactor = 1.0,
  lang = "en",
  onSetLang,
  locationName = "",
  onGoToSettings,
}) {
  const {
    shouldWater,
    bestWateringDate,
    noWaterReason,
    deficitMinutesPerM2,
    rainLast7,
    rainNext3,
  } = advice || {};

  // Derive active categories from the user's plant lists (pruning + moestuin tabs).
  const activeCategoryKeys = useMemo(() => {
    const keys = new Set();
    gardenPlants.forEach((p) => {
      const cat = p.waterCategory ?? detectWaterCategory(p);
      if (cat in CATEGORIES) keys.add(cat);
    });
    if (hasMoestuinPlants) keys.add("vegetable");
    return CATEGORY_ORDER.filter((k) => keys.has(k));
  }, [gardenPlants, hasMoestuinPlants]);

  const hasPlants = activeCategoryKeys.length > 0;

  // Compute today-watered early so categoryAdvice can use it.
  const todayKeyEarly = format(new Date(), "yyyy-MM-dd");
  const todayWateredEarly = !!wateringHistory[todayKeyEarly];

  // Compute per-category advice from shared weather inputs.
  const categoryAdvice = useMemo(() => {
    if (!weatherInputs || !hasPlants) return {};
    // When already watered today, drop today from the forecast so bestWateringDate
    // advances to the next day instead of staying on "Vandaag".
    const forecastForAdvice = todayWateredEarly
      ? (weatherInputs.dailyForecastNext5 ?? []).filter((d) => !isToday(new Date(d.date)))
      : weatherInputs.dailyForecastNext5;
    return Object.fromEntries(
      activeCategoryKeys.map((key) => {
        return [key, calculateWateringAdvice({
          ...weatherInputs,
          dailyForecastNext5: forecastForAdvice,
          lastWateredDate,
          wateringDaysLast7,
          sensitivityFactor,
          lang,
          ...getCategoryAdviceParams(key, soilMultiplier),
        })];
      })
    );
  }, [weatherInputs, activeCategoryKeys, hasPlants, todayWateredEarly, lastWateredDate, wateringDaysLast7, soilMultiplier, sensitivityFactor, lang]);

  // Sort categories: those needing water first (by earliest bestWateringDate), then the rest.
  const sortedCategoryKeys = useMemo(() => {
    if (!categoryAdvice || Object.keys(categoryAdvice).length === 0) return activeCategoryKeys;
    return [...activeCategoryKeys].sort((a, b) => {
      const ca = categoryAdvice[a];
      const cb = categoryAdvice[b];
      const aw = ca?.shouldWater ? 1 : 0;
      const bw = cb?.shouldWater ? 1 : 0;
      if (bw !== aw) return bw - aw; // water needed → top
      if (aw && bw) {
        const da = ca.bestWateringDate ? new Date(ca.bestWateringDate) : Infinity;
        const db = cb.bestWateringDate ? new Date(cb.bestWateringDate) : Infinity;
        return da - db; // earlier date → higher up
      }
      return CATEGORY_ORDER.indexOf(a) - CATEGORY_ORDER.indexOf(b);
    });
  }, [activeCategoryKeys, categoryAdvice]);

  const [categoryPopupKey, setCategoryPopupKey] = useState(null);
  const [infoSheet, setInfoSheet] = useState(null); // "rainfall" | "rec" | null

  const dateLocale = getDateLocale(lang);

  const heroDateRaw = new Date();

  const heroDay = format(heroDateRaw, "d");
  const heroMonth = format(heroDateRaw, "MMMM", { locale: dateLocale });
  const heroWeekday = format(heroDateRaw, "EEEE", { locale: dateLocale });

  // Today's watered state (for interactive badge)
  const todayWatered = todayWateredEarly;

  // Single source of truth for the badge: the forward-simulation schedule computed
  // in App.jsx (the same Set the calendar colours green). Deriving the badge from
  // min(schedule) guarantees Tab 1 and the calendar always agree — no separate,
  // non-cascading "best date" that can drift apart. The per-category cards below
  // still show each category's own advice for its amount/day detail.
  const effectiveBestDate = useMemo(() => {
    if (!wateringScheduleDates || wateringScheduleDates.size === 0) return null;
    let earliest = null;
    for (const iso of wateringScheduleDates) {
      const d = parseISO(iso);
      if (isNaN(d.getTime())) continue;
      if (earliest === null || d < earliest) earliest = d;
    }
    return earliest;
  }, [wateringScheduleDates]);

  const effectiveShouldWater = effectiveBestDate != null;
  const effectiveWaterToday = effectiveBestDate != null && isToday(effectiveBestDate);

  // Earliest scheduled watering day *after* today. Used to keep Tab 1 aligned
  // with the calendar when today is already marked watered: the schedule may
  // still hold a future day (e.g. Thursday) that the calendar colours green.
  const nextScheduledDate = useMemo(() => {
    if (!wateringScheduleDates || wateringScheduleDates.size === 0) return null;
    let earliest = null;
    for (const iso of wateringScheduleDates) {
      const d = parseISO(iso);
      if (isNaN(d.getTime()) || isToday(d) || d < new Date()) continue;
      if (earliest === null || d < earliest) earliest = d;
    }
    return earliest;
  }, [wateringScheduleDates]);

  // Best date for the no-plants recommendation card: prefer the schedule-derived
  // date, fall back to the generic advice's own best date.
  const bestDateForRec = effectiveBestDate
    ?? (bestWateringDate ? parseISO(bestWateringDate) : null);

  // Badge text + style based on advice state
  let badgeText = t(lang, "badgeLoading");
  let badgePulseColor = "#7ed956";
  let badgeClickable = false;
  if (!isLoading && !locationName) {
    badgeText = t(lang, "badgeNoLocation");
    badgePulseColor = "#94a3b8";
    badgeClickable = true;
  } else if (!isLoading && error) {
    badgeText = t(lang, "badgeUnableToLoad");
    badgePulseColor = "#f87171";
  } else if (!isLoading && advice) {
    if (todayWatered) {
      badgeText = nextScheduledDate
        ? (isTomorrow(nextScheduledDate)
            ? t(lang, "wateredTodayNextTomorrow")
            : t(lang, "wateredTodayNext", { weekday: format(nextScheduledDate, "EEEE", { locale: dateLocale }) }))
        : t(lang, "wateredToday");
      badgePulseColor = "#34d399";
      badgeClickable = true;
    } else if (effectiveWaterToday) {
      badgeClickable = true;
      badgeText = t(lang, "wateredTodayQuestion");
      badgePulseColor = "#f87171";
    } else if (effectiveShouldWater && effectiveBestDate != null) {
      badgeClickable = true;
      badgeText = isTomorrow(effectiveBestDate)
        ? t(lang, "badgeWaterTomorrow")
        : t(lang, "badgeWaterOn", { weekday: format(effectiveBestDate, "EEEE", { locale: getDateLocale(lang) }) });
      badgePulseColor = "#fb923c";
    } else if (noWaterReason === "upcoming_rain") {
      badgeText = t(lang, "badgeRainExpected");
      badgePulseColor = "#60a5fa";
    } else {
      badgeText = t(lang, "badgeWellWatered");
      badgePulseColor = "#34d399";
    }
  }

  // Progress bar widths (capped at 100%, ~20 mm = full bar)
  const RAIN_MAX = 20;
  const rainLast7Pct = Math.min(100, Math.max(2, ((rainLast7 || 0) / RAIN_MAX) * 100));
  const rainNext3Pct = Math.min(100, Math.max(2, ((rainNext3 || 0) / RAIN_MAX) * 100));

  // Plant illustration: derive current weather from today's forecast entry
  const currentWeather = getWeatherType(currentWeatherMain ?? dailyForecastNext5[0]?.main, dailyForecastNext5[0]?.rainMm);

  return (
    <div className="best-screen">

      {/* ── HERO HEADER ── */}
      <div className="best-hero">
        <div className="best-hero-top-row">
          {/* Language toggle */}
          <div className="best-lang-toggle">
            <button
              type="button"
              className={`best-lang-btn${lang === "en" ? " best-lang-btn--active" : ""}`}
              onClick={() => onSetLang?.("en")}
            >EN</button>
            <button
              type="button"
              className={`best-lang-btn${lang === "nl" ? " best-lang-btn--active" : ""}`}
              onClick={() => onSetLang?.("nl")}
            >NL</button>
          </div>
        </div>

        <div className="best-date-display">
          <div className="best-date-day">{heroDay}</div>
          <div className="best-date-meta">
            <span>{heroMonth}</span>
            <div className="best-date-dot" />
            <span>{heroWeekday}</span>
          </div>
          {locationName && (
            <div className="best-date-meta best-date-location">
              <span>{formatLocationDisplay(locationName)}</span>
            </div>
          )}
        </div>

        {badgeClickable ? (
          <button
            type="button"
            className="best-badge best-badge--btn"
            onClick={() => !locationName ? onGoToSettings?.() : onToggleWateredDay?.(new Date())}
          >
            <div className="best-badge-pulse" style={{ background: badgePulseColor }} />
            <span>{badgeText}</span>
          </button>
        ) : (
          <div className="best-badge">
            <div className="best-badge-pulse" style={{ background: badgePulseColor }} />
            <span>{badgeText}</span>
          </div>
        )}

        {!isLoading && !error && advice && (
          <div className="best-hero-illustration">
            <PlantIllustration weather={currentWeather} soilWet={!shouldWater || (bestWateringDate != null && !isToday(new Date(bestWateringDate)))} />
          </div>
        )}
      </div>

      {/* ── CONTENT AREA ── */}
      <div className="best-content">

        {!isLoading && !error && !advice && !locationName && (
          <div className="best-no-location">
            <div className="best-no-location-icon">📍</div>
            <p className="best-no-location-title">{t(lang, "noLocationTitle")}</p>
            <p className="best-no-location-sub">{t(lang, "noLocationSub")}</p>
            <button type="button" className="best-retry-btn" onClick={onGoToSettings}>
              {t(lang, "noLocationCta")}
            </button>
          </div>
        )}

        {isLoading && <p className="best-loading">{t(lang, "loadingWeather")}</p>}

        {error && (
          <div className="best-error-block">
            <p className="best-error">{error}</p>
            <button type="button" className="best-retry-btn" onClick={onRetry}>
              {t(lang, "retry")}
            </button>
          </div>
        )}

        {!isLoading && !error && advice && (
          <>
            {/* Rain overview */}
            <div className="best-section-label-row">
              <div className="best-section-label">{t(lang, "rainfallOverview")}</div>
              <InfoIcon onClick={() => setInfoSheet("rainfall")} />
            </div>
            <div className="best-rain-card">
              <div className="best-rain-divider" />
              <div className="best-rain-stat">
                <div className="best-rain-stat-label">{t(lang, "last7Days")}</div>
                <div>
                  <span className="best-rain-stat-value">{(rainLast7 || 0).toFixed(1)}</span>
                  <span className="best-rain-stat-unit"> mm</span>
                </div>
                <div className="best-rain-bar-wrap">
                  <div className="best-rain-bar" style={{ width: `${rainLast7Pct}%` }} />
                </div>
              </div>
              <div className="best-rain-stat">
                <div className="best-rain-stat-label">{t(lang, "next3Days")}</div>
                <div>
                  <span className="best-rain-stat-value">{(rainNext3 || 0).toFixed(1)}</span>
                  <span className="best-rain-stat-unit"> mm</span>
                </div>
                <div className="best-rain-bar-wrap">
                  <div className="best-rain-bar" style={{ width: `${rainNext3Pct}%` }} />
                </div>
              </div>
            </div>

            {/* Recommendation — per-category cards when plants are added, single card otherwise */}
            {hasPlants ? (
              <div className="best-cat-list">
                {sortedCategoryKeys.map((key) => {
                  const ca = categoryAdvice[key];
                  if (!ca) return null;
                  const watering = ca.shouldWater;
                  const dateRaw = watering && ca.bestWateringDate
                    ? (ca.bestWateringDate instanceof Date ? ca.bestWateringDate : new Date(ca.bestWateringDate))
                    : null;
                  const wateringToday = watering && dateRaw && isToday(dateRaw);
                  const dayLabel = dateRaw
                    ? isToday(dateRaw) ? t(lang, "badgeWaterToday")
                      : isTomorrow(dateRaw) ? t(lang, "badgeWaterTomorrow")
                      : t(lang, "badgeWaterOn", { weekday: format(dateRaw, "EEEE", { locale: dateLocale }) })
                    : null;
                  return (
                    <button
                      key={key}
                      type="button"
                      className={`best-cat-card${wateringToday ? " best-cat-card--water" : ""}`}
                      onClick={() => setCategoryPopupKey(key)}
                    >
                      <div className="best-cat-name">
                        <span>{CATEGORY_ICON[key]}</span>
                        {t(lang, CATEGORY_LABEL_KEY[key])}
                      </div>
                      <div className="best-cat-advice">
                        {watering ? (
                          <>
                            <span className="best-cat-amount">~{ca.deficitMinutesPerM2} min/m²</span>
                            {dayLabel && <span className="best-cat-day"> · {dayLabel}</span>}
                          </>
                        ) : ca.noWaterReason === "recent_watering" && nextScheduledDate ? (
                          isTomorrow(nextScheduledDate)
                            ? t(lang, "nextWateringTomorrow")
                            : t(lang, "nextWateringOn", { weekday: format(nextScheduledDate, "EEEE", { locale: dateLocale }) })
                        ) : (
                          t(lang, "noWateringNeeded")
                        )}
                      </div>
                      <div className="best-cat-chevron">›</div>
                    </button>
                  );
                })}
              </div>
            ) : (
              <>
                <div className="best-rec-card">
                  <div className="best-rec-label-row">
                    <div className="best-rec-label">{t(lang, "recommendation")}</div>
                    <InfoIcon onClick={() => setInfoSheet("rec")} dark />
                  </div>
                  {shouldWater ? (
                    <>
                      <div className="best-rec-main">~{deficitMinutesPerM2} min per m²</div>
                      <div className="best-rec-sub">
                        {bestDateForRec == null || isToday(bestDateForRec)
                          ? t(lang, "wateringAdvised")
                          : isTomorrow(bestDateForRec)
                            ? t(lang, "wateringAdvisedTomorrow")
                            : t(lang, "wateringAdvisedOn", { weekday: format(bestDateForRec, "EEEE", { locale: dateLocale }) })}
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="best-rec-main">{t(lang, "noWateringNeeded")}</div>
                      <div className="best-rec-sub">{getAdviceMessage(lang, advice)}</div>
                    </>
                  )}
                </div>
                <WhyBreakdown lang={lang} advice={advice} />
                <div className="best-add-plants-prompt">
                  <p className="best-add-plants-text">{t(lang, "catAddPlantsPrompt")}</p>
                </div>
              </>
            )}
          </>
        )}

      </div>

      {infoSheet && (
        <InfoSheet
          title={t(lang, infoSheet === "rainfall" ? "infoRainfallTitle" : "infoRecTitle")}
          body={t(lang, infoSheet === "rainfall" ? "infoRainfallBody" : "infoRecBody")}
          onClose={() => setInfoSheet(null)}
        />
      )}

      {categoryPopupKey && (
        <CategoryPlantsPopup
          categoryKey={categoryPopupKey}
          gardenPlants={gardenPlants}
          advice={categoryAdvice[categoryPopupKey]}
          onClose={() => setCategoryPopupKey(null)}
          lang={lang}
        />
      )}
    </div>
  );
}

function CategoryPlantsPopup({ categoryKey, gardenPlants, advice = null, onClose, lang }) {
  const [detailPlant, setDetailPlant] = useState(null);

  const plants = useMemo(() => {
    return gardenPlants.filter((p) => {
      const cat = p.waterCategory ?? detectWaterCategory(p);
      return cat === categoryKey;
    });
  }, [categoryKey, gardenPlants]);

  return (
    <>
      <div className="best-overlay" onClick={onClose}>
        <div className="best-cat-sheet" onClick={(e) => e.stopPropagation()}>
          <div className="best-cat-sheet-header">
            <span className="best-cat-sheet-title">
              {CATEGORY_ICON[categoryKey]} {t(lang, CATEGORY_LABEL_KEY[categoryKey])}
            </span>
            <button type="button" className="pruning-sheet-close" onClick={onClose}>✕</button>
          </div>
          {advice && <WhyBreakdown lang={lang} advice={advice} collapsible={false} />}
          {plants.length === 0 ? (
            <p className="best-cat-sheet-empty">{t(lang, "catNoPlants")}</p>
          ) : (
            <div className="best-cat-sheet-list">
              {plants.map((plant) => (
                <button
                  key={plant.id}
                  type="button"
                  className="best-cat-sheet-row"
                  onClick={() => setDetailPlant(plant)}
                >
                  <PlantThumbnail imageUrl={plant.imageUrl} commonName={plant.commonName} />
                  <div className="best-cat-sheet-row-info">
                    <span className="best-cat-sheet-row-name">{plant.commonName}</span>
                    <span className="best-cat-sheet-row-sci">{plant.scientificName}</span>
                  </div>
                  <span className="best-cat-sheet-row-arrow">›</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
      {detailPlant && (
        <PlantDetailPopup
          plant={detailPlant}
          onClose={() => setDetailPlant(null)}
          lang={lang}
        />
      )}
    </>
  );
}
