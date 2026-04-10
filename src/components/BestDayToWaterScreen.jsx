import React from "react";
import { format, isToday, isTomorrow } from "date-fns";
import "./BestDayToWaterScreen.css";
import { PlantIllustration } from "./PlantIllustration";
import LocationPicker from "./LocationPicker";
import { t, getDateLocale } from "../i18n";

/** Map OpenWeather `main` condition to illustration weather type. */
function getWeatherType(main) {
  if (!main) return "sunny";
  if (["Rain", "Drizzle", "Thunderstorm", "Snow"].includes(main)) return "rain";
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
 * @param {Object} props.location - { name: string, type: 'current' | 'saved' }
 * @param {string} props.locationName
 * @param {function} props.onLocationChange
 * @param {Object} props.advice   - result of calculateWateringAdvice
 * @param {Array}  props.dailyForecastNext5 - [{date, rainMm, main}, …] from OpenWeather
 * @param {boolean} props.isLoading
 * @param {string|null} props.error
 * @param {() => void} props.onRetry
 * @param {boolean} props.pushEnabled
 * @param {boolean} props.pushIsLoading
 * @param {(nextEnabled: boolean) => void} props.onTogglePush
 * @param {string} props.lang - 'en' | 'nl'
 * @param {(lang: string) => void} props.onSetLang
 */
export function BestDayToWaterScreen({
  location,
  locationName,
  onLocationChange,
  advice,
  dailyForecastNext5 = [],
  isLoading,
  error,
  onRetry,
  pushEnabled,
  pushIsLoading,
  onTogglePush,
  lang = "en",
  onSetLang,
}) {
  const {
    shouldWater,
    bestWateringDate,
    noWaterReason,
    deficitMinutesPerM2,
    rainLast7,
    rainNext3,
  } = advice || {};

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

  // Badge text + style based on advice state
  let badgeText = t(lang, "badgeLoading");
  let badgePulseColor = "#7ed956";
  if (!isLoading && error) {
    badgeText = t(lang, "badgeUnableToLoad");
    badgePulseColor = "#f87171";
  } else if (!isLoading && advice) {
    if (shouldWater) {
      if (isToday(heroDateRaw))        badgeText = t(lang, "badgeWaterToday");
      else if (isTomorrow(heroDateRaw)) badgeText = t(lang, "badgeWaterTomorrow");
      else                              badgeText = t(lang, "badgeWaterOn", { weekday: heroWeekday });
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
  const currentWeather = getWeatherType(dailyForecastNext5[0]?.main);

  // Location display: split "Amstelveen,NL" → city + country code
  const displayName = locationName || location?.name || "";
  const commaIdx = displayName.indexOf(",");
  const displayCity = commaIdx >= 0 ? displayName.slice(0, commaIdx) : displayName;
  const displayCountry = commaIdx >= 0 ? displayName.slice(commaIdx + 1).trim() : "";

  return (
    <div className="best-screen">

      {/* ── HERO HEADER ── */}
      <div className="best-hero">
        <div className="best-hero-top-row">
          <div className="best-app-title">🌿 Garden Watering</div>
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
        </div>

        <div className="best-badge">
          <div className="best-badge-pulse" style={{ background: badgePulseColor }} />
          <span>{badgeText}</span>
        </div>

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
            <div className="best-section-label">{t(lang, "rainfallOverview")}</div>
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

            {/* Recommendation */}
            <div className="best-rec-card">
              <div className="best-rec-label">{t(lang, "recommendation")}</div>
              {shouldWater ? (
                <>
                  <div className="best-rec-main">
                    ~{deficitMinutesPerM2} min per m²
                  </div>
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
          </>
        )}

        {/* Push notifications */}
        <div className="best-section-label">{t(lang, "reminders")}</div>
        <div
          role="button"
          aria-pressed={!!pushEnabled}
          onClick={() => {
            if (pushIsLoading) return;
            onTogglePush?.(!pushEnabled);
          }}
          className={`best-notif-card${pushIsLoading ? " best-notif-card--loading" : ""}`}
        >
          <div className="best-notif-info">
            <div className="best-notif-title">{t(lang, "pushNotifications")}</div>
            <div className="best-notif-sub">{t(lang, "pushNotificationsSub")}</div>
          </div>
          <div className={`best-toggle${pushEnabled ? " best-toggle--on" : ""}`} />
        </div>
        <div aria-live="polite" className="best-push-status">
          {pushIsLoading ? t(lang, "saving") : ""}
        </div>

        {/* Location */}
        <div className="best-section-label">{t(lang, "yourLocation")}</div>
        <div className="best-location-card">
          <div className="best-location-icon">📍</div>
          <div className="best-location-text">
            <div className="best-location-city">{displayCity || displayName}</div>
            {displayCountry && (
              <div className="best-location-country">{displayCountry}</div>
            )}
          </div>
        </div>

        <LocationPicker
          locationName={locationName || location?.name || ""}
          onLocationChange={onLocationChange}
          lang={lang}
        />

      </div>
    </div>
  );
}
