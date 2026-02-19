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
import "./CalendarScreen.css";

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
  onRetry,
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

  const isFutureDay = (day) => day > today;

  const handleDayClick = (day) => {
    if (isFutureDay(day)) return;
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
    <div className="cal-screen">
      {/* Top: Title */}
      <header className="cal-header">
        <h1>{title}</h1>
      </header>

      {/* Middle: calendar content */}
      <main className="cal-main">
        {/* Month navigation */}
        <div className="cal-month-nav">
          <button type="button" onClick={handlePrevMonth} className="cal-month-btn">
            ‹
          </button>
          <div className="cal-month-label">{monthLabel}</div>
          <button type="button" onClick={handleNextMonth} className="cal-month-btn">
            ›
          </button>
        </div>

        {error && (
          <div className="cal-error-block">
            <p className="cal-error">{error}</p>
            <button type="button" className="cal-retry-btn" onClick={onRetry}>
              Retry
            </button>
          </div>
        )}
        {isLoading && <p className="cal-loading">Loading weather data…</p>}

        {/* Weekday header */}
        <div className="cal-weekdays">
          {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
            <div key={d}>{d}</div>
          ))}
        </div>

        {/* Days grid */}
        <div className="cal-grid">
          {days.map((day) => {
            const iso = format(day, "yyyy-MM-dd");

            const inCurrentMonth = isSameMonth(day, currentMonth);
            const watered = isWateredDay(day);
            const recommended = isBestWateringDay(day);

            const isPastDay = day < today;

            const emoji = isPastDay
              ? getHistoricalEmoji(historicalByDate[iso])
              : getWeatherEmoji(weatherByDate[iso]?.main);

            const isFuture = isFutureDay(day);

            const dayClasses = [
              "cal-day",
              watered && "cal-day--watered",
              recommended && !watered && "cal-day--recommended",
              !inCurrentMonth && "cal-day--outside-month",
              isFuture && "cal-day--future",
            ]
              .filter(Boolean)
              .join(" ");

            const numberClasses = [
              "cal-day-number",
              isSameDay(day, today) && "cal-day-number--today",
            ]
              .filter(Boolean)
              .join(" ");

            return (
              <button
                key={iso}
                type="button"
                onClick={() => handleDayClick(day)}
                disabled={isFuture}
                className={dayClasses}
              >
                <span className={numberClasses}>
                  {format(day, "d")}
                </span>
                <span className="cal-day-emoji">{emoji}</span>
                <div className="cal-day-badges">
                  {watered && <span>💧</span>}
                  {recommended && !watered && <span>⭐</span>}
                </div>
              </button>
            );
          })}
        </div>

        {/* Legend */}
        <div className="cal-legend">
          <span>⭐ Best day to water</span>
          <span>💧 You watered</span>
        </div>
      </main>
    </div>
  );
}
