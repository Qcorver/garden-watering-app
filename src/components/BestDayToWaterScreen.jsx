import React from "react";
import { format, isToday, isTomorrow } from "date-fns";
import "./BestDayToWaterScreen.css";
import { PlantIllustration } from "./PlantIllustration";
import LocationPicker from "./LocationPicker";

/** Map OpenWeather `main` condition to illustration weather type. */
function getWeatherType(main) {
  if (!main) return "sunny";
  if (["Rain", "Drizzle", "Thunderstorm", "Snow"].includes(main)) return "rain";
  if (main === "Clouds" || main === "Atmosphere") return "cloudy";
  return "sunny";
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
}) {
  const {
    shouldWater,
    bestWateringDate,
    message,
    rainLast7,
    rainNext3,
    noWaterReason,
    deficitLitersPerM2,
  } = advice || {};

  // Date shown in the hero — best watering date if applicable, otherwise today
  const heroDateRaw =
    shouldWater && bestWateringDate
      ? bestWateringDate instanceof Date
        ? bestWateringDate
        : new Date(bestWateringDate)
      : new Date();

  const heroDay = format(heroDateRaw, "d");
  const heroMonth = format(heroDateRaw, "MMMM");
  const heroWeekday = format(heroDateRaw, "EEEE");

  // Badge text + style based on advice state
  let badgeText = "Loading…";
  let badgePulseColor = "#7ed956";
  if (!isLoading && error) {
    badgeText = "Unable to load";
    badgePulseColor = "#f87171";
  } else if (!isLoading && advice) {
    if (shouldWater) {
      if (isToday(heroDateRaw)) badgeText = "Water today";
      else if (isTomorrow(heroDateRaw)) badgeText = "Water tomorrow";
      else badgeText = `Water on ${format(heroDateRaw, "EEEE")}`;
    } else if (noWaterReason === "upcoming_rain") {
      badgeText = "Rain expected";
      badgePulseColor = "#60a5fa";
    } else {
      badgeText = "Well watered";
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
        <div className="best-app-title">🌿 Garden Watering</div>

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

        {isLoading && <p className="best-loading">Loading weather data…</p>}

        {error && (
          <div className="best-error-block">
            <p className="best-error">{error}</p>
            <button type="button" className="best-retry-btn" onClick={onRetry}>
              Retry
            </button>
          </div>
        )}

        {!isLoading && !error && advice && (
          <>
            {/* Rain overview */}
            <div className="best-section-label">Rainfall overview</div>
            <div className="best-rain-card">
              <div className="best-rain-divider" />
              <div className="best-rain-stat">
                <div className="best-rain-stat-label">Last 7 days</div>
                <div>
                  <span className="best-rain-stat-value">{(rainLast7 || 0).toFixed(1)}</span>
                  <span className="best-rain-stat-unit"> mm</span>
                </div>
                <div className="best-rain-bar-wrap">
                  <div className="best-rain-bar" style={{ width: `${rainLast7Pct}%` }} />
                </div>
              </div>
              <div className="best-rain-stat">
                <div className="best-rain-stat-label">Next 3 days</div>
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
              <div className="best-rec-label">Recommendation</div>
              {shouldWater ? (
                <>
                  <div className="best-rec-main">
                    ~{(deficitLitersPerM2 || 0).toFixed(0)} L per m²
                  </div>
                  <div className="best-rec-sub">Rain insufficient — watering advised</div>
                </>
              ) : (
                <>
                  <div className="best-rec-main">No watering needed</div>
                  <div className="best-rec-sub">{message}</div>
                </>
              )}
            </div>
          </>
        )}

        {/* Push notifications */}
        <div className="best-section-label">Reminders</div>
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
            <div className="best-notif-title">Push notifications</div>
            <div className="best-notif-sub">Get reminded when it's time to water</div>
          </div>
          <div className={`best-toggle${pushEnabled ? " best-toggle--on" : ""}`} />
        </div>
        <div aria-live="polite" className="best-push-status">
          {pushIsLoading ? "Saving…" : ""}
        </div>

        {/* Location */}
        <div className="best-section-label">Your location</div>
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
        />

      </div>
    </div>
  );
}
