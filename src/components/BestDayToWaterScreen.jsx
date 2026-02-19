import React from "react";
import { format } from "date-fns";

/**
 * @param {Object} props
 * @param {Object} props.location - { name: string, type: 'current' | 'saved' }
 * @param {Object} props.advice   - result of calculateWateringAdvice
 * @param {boolean} props.isLoading
 * @param {string|null} props.error
 * @param {boolean} props.pushEnabled
 * @param {boolean} props.pushIsLoading
 * @param {(nextEnabled: boolean) => void} props.onTogglePush
 */
export function BestDayToWaterScreen({
  location,
  advice,
  isLoading,
  error,
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

  // You can still use this label if you want to show location somewhere in the future
  const locationLabel =
    location?.type === "current"
      ? "Using current location"
      : location?.name
      ? `Using: ${location.name}`
      : "No location selected";

  return (
    <div
      style={{
        flex: 1,                     // 👈 fills available height given by App.jsx
        display: "flex",
        flexDirection: "column",
        padding: "16px",
        fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, sans-serif",
        backgroundColor: "#f9fafb",
        color: "#111827",
      }}
    >
      {/* Top: Title */}
      <header style={{ textAlign: "center", marginTop: "24px" }}>
        <h1 style={{ fontSize: "20px", fontWeight: 600 }}>{title}</h1>
      </header>

      {/* Middle: Main content */}
      <main
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: "16px",
        }}
      >
        {isLoading && <p>Loading weather data…</p>}
        {error && <p style={{ color: "red" }}>{error}</p>}

        {!isLoading && !error && advice && (
          <>
            {shouldWater ? (
              <>
                {/* Big date card */}
                {formattedDate && (
                  <div
                    style={{
                      padding: "24px 32px",
                      borderRadius: "24px",
                      boxShadow: "0 4px 12px rgba(0,0,0,0.06)",
                      textAlign: "center",
                      backgroundColor: "#ffffff",
                    }}
                  >
                    <div style={{ fontSize: "56px", fontWeight: 700 }}>
                      {formattedDate.day}
                    </div>
                    <div
                      style={{
                        fontSize: "14px",
                        fontWeight: 500,
                        marginTop: "4px",
                        letterSpacing: "0.08em",
                      }}
                    >
                      {formattedDate.month} · {formattedDate.weekday}
                    </div>
                  </div>
                )}

                {/* Watering can placeholder */}
                <div style={{ marginTop: "16px", fontSize: "32px" }}>
                  💧🫙
                </div>
              </>
            ) : (
              <>
                {/* Rain cloud visual */}
                <div style={{ fontSize: "48px" }}>🌧️</div>
              </>
            )}

            {/* Message */}
            <p
              style={{
                maxWidth: "260px",
                textAlign: "center",
                marginTop: "8px",
                fontSize: "14px",
                color: "#4b5563",
              }}
            >
              {message}
            </p>

            {/* Debug info */}
            {advice && (
              <div
                style={{
                  marginTop: "16px",
                  fontSize: "12px",
                  color: "#6b7280",
                  lineHeight: "1.4",
                  textAlign: "center",
                  maxWidth: "260px",
                }}
              >
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

      {/* Push notifications toggle (tappable card; sits above the location area rendered in App.jsx) */}
      <div
        role="button"
        aria-pressed={!!pushEnabled}
        onClick={() => {
          if (pushIsLoading) return;
          onTogglePush?.(!pushEnabled);
        }}
        style={{
          marginTop: "12px",
          padding: "12px",
          borderRadius: "16px",
          backgroundColor: "#ffffff",
          boxShadow: "0 2px 10px rgba(0,0,0,0.04)",
          cursor: pushIsLoading ? "default" : "pointer",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "12px",
          }}
        >
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: "14px", fontWeight: 700 }}>
              Push notifications
            </div>
            <div
              style={{
                marginTop: "2px",
                fontSize: "13px",
                color: "#6b7280",
              }}
            >
              Get a reminder when it’s the best time to water.
            </div>
          </div>

        <input
  type="checkbox"
  checked={!!pushEnabled}
  disabled={!!pushIsLoading}
  readOnly
  aria-label="Enable push notifications"
  style={{ pointerEvents: "none" }}
/>
        </div>
      </div>

      <div
        aria-live="polite"
        style={{
          marginTop: "6px",
          fontSize: "12px",
          color: "#6b7280",
          minHeight: "16px",
        }}
      >
        {pushIsLoading ? "Saving…" : ""}
      </div>

      {/* ⛔️ OLD FOOTER REMOVED
          The LocationPicker in App.jsx now renders the footer UI. */}
    </div>
  );
}