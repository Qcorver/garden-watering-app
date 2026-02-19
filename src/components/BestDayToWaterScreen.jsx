import React from "react";
import { format } from "date-fns";
import "./BestDayToWaterScreen.css";

/**
 * @param {Object} props
 * @param {Object} props.location - { name: string, type: 'current' | 'saved' }
 * @param {Object} props.advice   - result of calculateWateringAdvice
 * @param {boolean} props.isLoading
 * @param {string|null} props.error
 * @param {() => void} props.onRetry
 * @param {boolean} props.pushEnabled
 * @param {boolean} props.pushIsLoading
 * @param {(nextEnabled: boolean) => void} props.onTogglePush
 */
export function BestDayToWaterScreen({
  location,
  advice,
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
    dailyForecastNext5,
  } = advice || {};

  const title = "Best day to water your plants";

  const formattedDate =
    bestWateringDate && shouldWater
      ? {
          day: format(bestWateringDate, "d"),
          month: format(bestWateringDate, "MMM").toUpperCase(),
          weekday: format(bestWateringDate, "EEEE").toUpperCase(),
        }
      : null;

  return (
    <div className="best-screen">
      {/* Top: Title */}
      <header className="best-header">
        <h1>{title}</h1>
      </header>

      {/* Middle: Main content */}
      <main className="best-main">
        {isLoading && <p>Loading weather data…</p>}
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
            {shouldWater ? (
              <>
                {/* Big date card */}
                {formattedDate && (
                  <div className="best-date-card">
                    <div className="best-date-day">
                      {formattedDate.day}
                    </div>
                    <div className="best-date-sub">
                      {formattedDate.month} · {formattedDate.weekday}
                    </div>
                  </div>
                )}

                {/* Watering can placeholder */}
                <div className="best-emoji">💧🫙</div>
              </>
            ) : (
              <>
                {/* Rain cloud visual */}
                <div className="best-emoji--rain">🌧️</div>
              </>
            )}

            {/* Message */}
            <p className="best-message">{message}</p>

            {/* Rain stats */}
            {advice && (
              <div className="best-rain-stats">
                <div>
                  <strong>Rain last 7 days:</strong>{" "}
                  {rainLast7?.toFixed(1)} mm
                </div>
                <div>
                  <strong>Rain next 3 days:</strong>{" "}
                  {rainNext3?.toFixed(1)} mm
                </div>
              </div>
            )}
          </>
        )}
      </main>

      {/* Push notifications toggle */}
      <div
        role="button"
        aria-pressed={!!pushEnabled}
        onClick={() => {
          if (pushIsLoading) return;
          onTogglePush?.(!pushEnabled);
        }}
        className={`best-push-card${pushIsLoading ? " best-push-card--loading" : ""}`}
      >
        <div className="best-push-row">
          <div className="best-push-text">
            <div className="best-push-title">Push notifications</div>
            <div className="best-push-desc">
              Get a reminder when it's the best time to water.
            </div>
          </div>

          <input
            type="checkbox"
            checked={!!pushEnabled}
            disabled={!!pushIsLoading}
            readOnly
            aria-label="Enable push notifications"
            className="best-push-checkbox"
          />
        </div>
      </div>

      <div aria-live="polite" className="best-push-status">
        {pushIsLoading ? "Saving…" : ""}
      </div>
    </div>
  );
}
