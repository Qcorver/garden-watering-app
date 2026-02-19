import React from "react";
import {
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  addMonths,
  isSameDay,
  isSameMonth,
  format,
} from "date-fns";

/**
 * @param {Object} props
 * @param {Object|null} props.advice
 * @param {Array<Object>} props.dailyForecastNext5
 * @param {Array<Object>} props.historicalDailyRain
 *   - items: { date: Date|string, rainMm: number, cloudCoverMean?: number|null }
 * @param {Object} props.wateringHistory - { [isoDate: string]: boolean }
 * @param {function(Date): void} props.onToggleWateredDay
 * @param {Date} props.currentMonth
 * @param {function(Date): void} props.onMonthChange
 * @param {boolean} props.isLoading
 * @param {string|null} props.error
 */
export function CalendarScreen({
  advice,
  dailyForecastNext5,
  historicalDailyRain,
  wateringHistory,
  onToggleWateredDay,
  currentMonth,
  onMonthChange,
  isLoading,
  error,
}) {
  const title = "Watering calendar";

  // Start-of-today (local time) for comparing past vs future days
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  // Historical lookup map (YYYY-MM-DD -> item)
  const historicalByDate = React.useMemo(() => {
    if (!historicalDailyRain || historicalDailyRain.length === 0) {
      return {};
    }
    const map = {};
    historicalDailyRain.forEach((item) => {
      const dateObj =
        item.date instanceof Date ? item.date : new Date(item.date);
      const key = format(dateObj, "yyyy-MM-dd");
      map[key] = {
        ...item,
        date: dateObj,
      };
    });
    return map;
  }, [historicalDailyRain]);

  // Calendar range (full weeks shown)
  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const calendarStart = startOfWeek(monthStart, { weekStartsOn: 1 }); // Monday
  const calendarEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });

  const days = eachDayOfInterval({ start: calendarStart, end: calendarEnd });

  // Forecast lookup map (YYYY-MM-DD -> item)
  const weatherByDate = React.useMemo(() => {
    if (!dailyForecastNext5 || dailyForecastNext5.length === 0) {
      return {};
    }

    const map = {};
    dailyForecastNext5.forEach((item) => {
      const dateObj =
        item.date instanceof Date ? item.date : new Date(item.date);
      const key = format(dateObj, "yyyy-MM-dd");

      const main =
        item.main ||
        item.weatherMain ||
        (item.weather && item.weather[0] && item.weather[0].main) ||
        null;

      map[key] = {
        ...item,
        date: dateObj,
        main,
      };
    });

    return map;
  }, [dailyForecastNext5]);

  const getWeatherEmoji = (main) => {
    if (!main) return "·";
    switch (main) {
      case "Clear":
        return "☀️";
      case "Clouds":
        return "☁️";
      case "Drizzle":
      case "Rain":
        return "🌧️";
      case "Thunderstorm":
        return "⛈️";
      case "Snow":
        return "❄️";
      default:
        return "🌦️";
    }
  };

  // Cloud cover threshold (%) to decide ☁️ vs ☀️ on historical dry days
  const CLOUDY_THRESHOLD = 60;

  const getHistoricalEmoji = (hist) => {
    if (!hist) return "·";
    const rainMm = Number(hist.rainMm ?? 0);

    if (rainMm > 0) return "🌧️";

    const cloud = hist.cloudCoverMean;
    if (typeof cloud === "number") {
      return cloud >= CLOUDY_THRESHOLD ? "☁️" : "☀️";
    }

    // If we have rain data but no cloud data, default to sun
    return "☀️";
  };

  const isBestWateringDay = (day) => {
    if (!advice?.shouldWater || !advice?.bestWateringDate) return false;
    return isSameDay(day, advice.bestWateringDate);
  };

  const isWateredDay = (day) => {
    const key = format(day, "yyyy-MM-dd");
    return Boolean(wateringHistory[key]);
  };

  const handleDayClick = (day) => {
    onToggleWateredDay(day);
  };

  const handlePrevMonth = () => {
    onMonthChange(addMonths(currentMonth, -1));
  };

  const handleNextMonth = () => {
    onMonthChange(addMonths(currentMonth, 1));
  };

  const monthLabel = format(currentMonth, "MMMM yyyy");

  return (
    <div
      style={{
        flex: 1,
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

      {/* Middle: calendar content */}
      <main
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          gap: "12px",
          marginTop: "16px",
        }}
      >
        {/* Month navigation */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            margin: "0 4px",
          }}
        >
          <button
            type="button"
            onClick={handlePrevMonth}
            style={{
              border: "none",
              background: "transparent",
              fontSize: "20px",
              padding: "4px 8px",
              cursor: "pointer",
            }}
          >
            ‹
          </button>
          <div
            style={{
              fontSize: "16px",
              fontWeight: 500,
              color: "#111827",
            }}
          >
            {monthLabel}
          </div>
          <button
            type="button"
            onClick={handleNextMonth}
            style={{
              border: "none",
              background: "transparent",
              fontSize: "20px",
              padding: "4px 8px",
              cursor: "pointer",
            }}
          >
            ›
          </button>
        </div>

        {error && (
          <p style={{ color: "red", textAlign: "center", fontSize: "14px" }}>
            {error}
          </p>
        )}
        {isLoading && (
          <p style={{ textAlign: "center", fontSize: "14px" }}>
            Loading weather data…
          </p>
        )}

        {/* Weekday header */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(7, 1fr)",
            gap: "4px",
            marginTop: "4px",
            fontSize: "11px",
            color: "#6b7280",
            textAlign: "center",
          }}
        >
          {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
            <div key={d}>{d}</div>
          ))}
        </div>

        {/* Days grid */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(7, 1fr)",
            gap: "6px",
            marginTop: "4px",
          }}
        >
          {days.map((day) => {
            const iso = format(day, "yyyy-MM-dd");

            const inCurrentMonth = isSameMonth(day, currentMonth);
            const watered = isWateredDay(day);
            const recommended = isBestWateringDay(day);

            const isPastDay = day < today;

            const emoji = isPastDay
              ? getHistoricalEmoji(historicalByDate[iso])
              : getWeatherEmoji(weatherByDate[iso]?.main);

            return (
              <button
                key={iso}
                type="button"
                onClick={() => handleDayClick(day)}
                style={{
                  borderRadius: "12px",
                  padding: "6px 4px",
                  border: `1px solid ${
                    recommended && !watered
                      ? "#3b82f6"
                      : "rgba(0,0,0,0.05)"
                  }`,
                  backgroundColor: watered ? "#dbeafe" : "#ffffff",
                  boxShadow:
                    recommended && !watered
                      ? "0 0 0 1px rgba(59,130,246,0.3)"
                      : "0 1px 3px rgba(0,0,0,0.04)",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "space-between",
                  minHeight: "60px",
                  cursor: "pointer",
                  opacity: inCurrentMonth ? 1 : 0.4,
                }}
              >
                <span
                  style={{
                    fontSize: "14px",
                    fontWeight: 600,
                    color: isSameDay(day, today)
                      ? "#dc2626" // red for today
                      : inCurrentMonth
                      ? "#111827"
                      : "#9ca3af",
                  }}
                >
                  {format(day, "d")}
                </span>
                <span style={{ fontSize: "16px", marginTop: "2px" }}>
                  {emoji}
                </span>
                <div
                  style={{
                    display: "flex",
                    gap: "4px",
                    marginTop: "2px",
                    fontSize: "11px",
                  }}
                >
                  {watered && <span>💧</span>}
                  {recommended && !watered && <span>⭐</span>}
                </div>
              </button>
            );
          })}
        </div>

        {/* Legend */}
        <div
          style={{
            marginTop: "8px",
            display: "flex",
            justifyContent: "center",
            gap: "16px",
            fontSize: "12px",
            color: "#6b7280",
          }}
        >
          <span>⭐ Best day to water</span>
          <span>💧 You watered</span>
        </div>
      </main>
    </div>
  );
}