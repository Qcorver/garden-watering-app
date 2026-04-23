import React, { useMemo, useState } from "react";
import { format, isToday, isTomorrow, subDays } from "date-fns";
import "./BestDayToWaterScreen.css";
import { PlantIllustration } from "./PlantIllustration";
import { t, getDateLocale } from "../i18n";
import { CATEGORIES, calculateWateringAdvice } from "@shared/wateringLogic";
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
  if (noWaterReason === "recent_watering") return t(lang, "msgRecentWatering");
  if (noWaterReason === "upcoming_rain")   return t(lang, "msgUpcomingRain");
  if (noWaterReason === "recent_rain") {
    // Two distinct recent-rain messages — pick by which field in advice is set.
    // The "adequately moistened" case comes from the weekly-total check.
    // The "still wet" case comes from the short-window gates.
    // We can't distinguish them here without adding a sub-reason, so we use
    // the generic "still wet" message (covers both sensibly in the UI).
    return t(lang, "msgRecentRainShort");
  }
  return t(lang, "msgWeeklyRain");
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
  gardenPlants = [],
  lastWateredDate = null,
  wateringHistory = {},
  onToggleWateredDay,
  dailyForecastNext5 = [],
  isLoading,
  error,
  onRetry,
  soilMultiplier = 1.0,
  sensitivityFactor = 1.0,
  lang = "en",
  onSetLang,
  locationName = "",
}) {
  const {
    shouldWater,
    bestWateringDate,
    noWaterReason,
    deficitMinutesPerM2,
    rainLast7,
    rainNext3,
  } = advice || {};

  // Derive active categories from the user's plant lists (pruning + herbs tabs).
  const activeCategoryKeys = useMemo(() => {
    const keys = new Set();
    gardenPlants.forEach((p) => {
      const cat = p.waterCategory ?? detectWaterCategory(p);
      if (cat in CATEGORIES) keys.add(cat);
    });
    return CATEGORY_ORDER.filter((k) => keys.has(k));
  }, [gardenPlants]);

  const hasPlants = activeCategoryKeys.length > 0;

  // Compute per-category advice from shared weather inputs.
  const categoryAdvice = useMemo(() => {
    if (!weatherInputs || !hasPlants) return {};
    return Object.fromEntries(
      activeCategoryKeys.map((key) => {
        const { multiplier, rainEfficiency } = CATEGORIES[key];
        return [key, calculateWateringAdvice({
          ...weatherInputs,
          weeklyTargetMultiplier: multiplier,
          rainEfficiency,
          lastWateredDate,
          soilMultiplier,
          sensitivityFactor,
          lang,
        })];
      })
    );
  }, [weatherInputs, activeCategoryKeys, hasPlants, lastWateredDate, soilMultiplier, sensitivityFactor, lang]);

  const [categoryPopupKey, setCategoryPopupKey] = useState(null);
  const [infoSheet, setInfoSheet] = useState(null); // "rainfall" | "rec" | null

  const dateLocale = getDateLocale(lang);

  // Date shown in the hero — best watering date if applicable, otherwise today
  let heroDateRaw = new Date();
  if (shouldWater && bestWateringDate) {
    const parsed = bestWateringDate instanceof Date ? bestWateringDate : new Date(bestWateringDate);
    if (!isNaN(parsed.getTime())) heroDateRaw = parsed;
  }

  const heroDay = format(heroDateRaw, "d");
  const heroMonth = format(heroDateRaw, "MMMM", { locale: dateLocale });
  const heroWeekday = format(heroDateRaw, "EEEE", { locale: dateLocale });

  // Today's / yesterday's watered state (for interactive badge)
  const todayKey = format(new Date(), "yyyy-MM-dd");
  const yesterdayKey = format(subDays(new Date(), 1), "yyyy-MM-dd");
  const todayWatered = !!wateringHistory[todayKey];
  const yesterdayWatered = !!wateringHistory[yesterdayKey];

  // When per-category advice is available, any category needing water should
  // override the main (generic garden) shouldWater flag for the badge.
  const effectiveShouldWater = hasPlants && Object.keys(categoryAdvice).length > 0
    ? Object.values(categoryAdvice).some((ca) => ca?.shouldWater)
    : shouldWater;

  // Badge text + style based on advice state
  let badgeText = t(lang, "badgeLoading");
  let badgePulseColor = "#7ed956";
  let badgeClickable = false;
  if (!isLoading && error) {
    badgeText = t(lang, "badgeUnableToLoad");
    badgePulseColor = "#f87171";
  } else if (!isLoading && advice) {
    if (todayWatered) {
      badgeText = t(lang, "wateredToday");
      badgePulseColor = "#34d399";
      badgeClickable = true;
    } else if (yesterdayWatered) {
      badgeText = t(lang, "wateredYesterday");
      badgePulseColor = effectiveShouldWater ? "#f87171" : "#34d399";
    } else if (effectiveShouldWater) {
      badgeClickable = true;
      badgeText = t(lang, "wateredTodayQuestion");
      badgePulseColor = "#f87171";
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
  const currentWeather = getWeatherType(dailyForecastNext5[0]?.main, dailyForecastNext5[0]?.rainMm);

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
              <span>{locationName}</span>
            </div>
          )}
        </div>

        {badgeClickable ? (
          <button
            type="button"
            className="best-badge best-badge--btn"
            onClick={() => onToggleWateredDay?.(new Date())}
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
            <PlantIllustration weather={currentWeather} soilWet={!shouldWater} />
          </div>
        )}
      </div>

      {/* ── CONTENT AREA ── */}
      <div className="best-content">

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
                {activeCategoryKeys.map((key) => {
                  const ca = categoryAdvice[key];
                  if (!ca) return null;
                  const watering = ca.shouldWater;
                  const dateRaw = watering && ca.bestWateringDate
                    ? (ca.bestWateringDate instanceof Date ? ca.bestWateringDate : new Date(ca.bestWateringDate))
                    : null;
                  const dayLabel = dateRaw
                    ? isToday(dateRaw) ? t(lang, "badgeWaterToday")
                      : isTomorrow(dateRaw) ? t(lang, "badgeWaterTomorrow")
                      : t(lang, "badgeWaterOn", { weekday: format(dateRaw, "EEEE", { locale: dateLocale }) })
                    : null;
                  return (
                    <div
                      key={key}
                      role="button"
                      className={`best-cat-card${watering ? " best-cat-card--water" : ""}`}
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
                        ) : (
                          t(lang, "noWateringNeeded")
                        )}
                      </div>
                      <div className="best-cat-chevron">›</div>
                    </div>
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
                        {isTomorrow(heroDateRaw)
                          ? t(lang, "wateringAdvisedTomorrow")
                          : isToday(heroDateRaw)
                            ? t(lang, "wateringAdvised")
                            : t(lang, "wateringAdvisedOn", { weekday: heroWeekday })}
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="best-rec-main">{t(lang, "noWateringNeeded")}</div>
                      <div className="best-rec-sub">{getAdviceMessage(lang, advice)}</div>
                    </>
                  )}
                </div>
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
          onClose={() => setCategoryPopupKey(null)}
          lang={lang}
        />
      )}
    </div>
  );
}

function CategoryPlantsPopup({ categoryKey, gardenPlants, onClose, lang }) {
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
