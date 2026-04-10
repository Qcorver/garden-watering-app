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
  isToday,
  format,
} from "date-fns";
import "./CalendarScreen.css";
import { t, getDateLocale } from "../i18n";

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
 * @param {string} props.lang - 'en' | 'nl'
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
  lang = "en",
}) {
  const dateLocale = getDateLocale(lang);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  // Navigation bounds: 1 month back, current month max
  const minMonth = startOfMonth(addMonths(today, -1));
  const maxMonth = startOfMonth(today);
  const canGoPrev = currentMonth > minMonth;
  const canGoNext = currentMonth < maxMonth;

  // Historical lookup map (YYYY-MM-DD -> item)
  const historicalByDate = React.useMemo(() => {
    if (!historicalDailyRain || historicalDailyRain.length === 0) return {};
    const map = {};
    historicalDailyRain.forEach((item) => {
      const dateObj = item.date instanceof Date ? item.date : new Date(item.date);
      const key = format(dateObj, "yyyy-MM-dd");
      map[key] = { ...item, date: dateObj };
    });
    return map;
  }, [historicalDailyRain]);

  // Calendar range (full weeks, Monday start)
  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const calendarStart = startOfWeek(monthStart, { weekStartsOn: 1 });
  const calendarEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });
  const days = eachDayOfInterval({ start: calendarStart, end: calendarEnd });

  // Forecast lookup map (YYYY-MM-DD -> item)
  const weatherByDate = React.useMemo(() => {
    if (!dailyForecastNext5 || dailyForecastNext5.length === 0) return {};
    const map = {};
    dailyForecastNext5.forEach((item) => {
      const dateObj = item.date instanceof Date ? item.date : new Date(item.date);
      const key = format(dateObj, "yyyy-MM-dd");
      const main =
        item.main ||
        item.weatherMain ||
        (item.weather && item.weather[0] && item.weather[0].main) ||
        null;
      map[key] = { ...item, date: dateObj, main };
    });
    return map;
  }, [dailyForecastNext5]);

  const getWeatherEmoji = (main) => {
    if (!main) return null;
    switch (main) {
      case "Clear": return "☀️";
      case "Clouds": return "⛅";
      case "Drizzle":
      case "Rain": return "🌧️";
      case "Thunderstorm": return "⛈️";
      case "Snow": return "❄️";
      default: return "🌦️";
    }
  };

  const CLOUDY_THRESHOLD = 60;
  const getHistoricalEmoji = (hist) => {
    if (!hist) return null;
    const rainMm = Number(hist.rainMm ?? 0);
    if (rainMm > 0) return "🌧️";
    const cloud = hist.cloudCoverMean;
    if (typeof cloud === "number") return cloud >= CLOUDY_THRESHOLD ? "☁️" : "☀️";
    return "☀️";
  };

  const isBestWateringDay = (day) => {
    if (!advice?.shouldWater || !advice?.bestWateringDate) return false;
    return isSameDay(day, advice.bestWateringDate);
  };

  const isWateredDay = (day) => Boolean(wateringHistory[format(day, "yyyy-MM-dd")]);
  const isFutureDay = (day) => day > today;

  const handleDayClick = (day) => {
    if (isFutureDay(day)) return;
    onToggleWateredDay(day);
  };

  const handlePrevMonth = () => {
    if (canGoPrev) onMonthChange(addMonths(currentMonth, -1));
  };
  const handleNextMonth = () => {
    if (canGoNext) onMonthChange(addMonths(currentMonth, 1));
  };

  const monthLabel = format(currentMonth, "MMMM yyyy", { locale: dateLocale });
  const weekdays = t(lang, "calWeekdays");

  return (
    <div className="cal-screen">

      {/* ── HEADER ── */}
      <div className="cal-header">
        <div className="cal-header-app-title">🌿 Garden Watering</div>
        <div className="cal-header-title">
          {t(lang, "calTitle").split("\n").map((line, i) => (
            <React.Fragment key={i}>{line}{i === 0 && <br />}</React.Fragment>
          ))}
        </div>
        <div className="cal-header-subtitle">{monthLabel}</div>

        <div className="cal-month-nav">
          <div className="cal-month-name">{monthLabel}</div>
          <div className="cal-nav-buttons">
            <button
              type="button"
              onClick={handlePrevMonth}
              disabled={!canGoPrev}
              className="cal-nav-btn"
              aria-label={t(lang, "calPrevMonth")}
            >
              ‹
            </button>
            <button
              type="button"
              onClick={handleNextMonth}
              disabled={!canGoNext}
              className="cal-nav-btn"
              aria-label={t(lang, "calNextMonth")}
            >
              ›
            </button>
          </div>
        </div>
      </div>

      {/* ── BODY ── */}
      <div className="cal-body">

        {error && (
          <div className="cal-error-block">
            <p className="cal-error">{error}</p>
            <button type="button" className="cal-retry-btn" onClick={onRetry}>
              {t(lang, "retry")}
            </button>
          </div>
        )}
        {isLoading && <p className="cal-loading">{t(lang, "loadingWeather")}</p>}

        {/* Weekday header */}
        <div className="cal-weekdays">
          {weekdays.map((d) => (
            <div key={d} className="cal-weekday">{d}</div>
          ))}
        </div>

        {/* Days grid */}
        <div className="cal-grid">
          {days.map((day) => {
            const iso = format(day, "yyyy-MM-dd");
            const inCurrentMonth = isSameMonth(day, currentMonth);
            const watered = isWateredDay(day);
            const recommended = isBestWateringDay(day);
            const todayDay = isToday(day);
            const isPastDay = day < today;
            const futureDay = isFutureDay(day);
            const hasWeather = isPastDay
              ? Boolean(historicalByDate[iso])
              : Boolean(weatherByDate[iso]);
            const noData = futureDay && !hasWeather;

            const emoji = isPastDay
              ? getHistoricalEmoji(historicalByDate[iso])
              : getWeatherEmoji(weatherByDate[iso]?.main);

            // Cell class priority: watered > today > best > no-data > other-month > normal
            const cellClass = [
              "cal-day",
              watered && "cal-day--watered",
              !watered && todayDay && "cal-day--today",
              !watered && !todayDay && recommended && "cal-day--best",
              noData && !watered && "cal-day--no-data",
              !inCurrentMonth && "cal-day--other-month",
            ]
              .filter(Boolean)
              .join(" ");

            return (
              <button
                key={iso}
                type="button"
                onClick={() => handleDayClick(day)}
                disabled={futureDay}
                className={cellClass}
              >
                <span className="cal-day-num">{format(day, "d")}</span>
                {emoji && <span className="cal-day-icon">{emoji}</span>}
                {!emoji && !noData && <span className="cal-day-icon">·</span>}
              </button>
            );
          })}
        </div>

        {/* Legend */}
        <div className="cal-legend">
          <div className="cal-legend-item">
            <div className="cal-legend-dot cal-legend-dot--today" />
            <span className="cal-legend-label">{t(lang, "calLegendToday")}</span>
          </div>
          <div className="cal-legend-item">
            <div className="cal-legend-dot cal-legend-dot--best" />
            <span className="cal-legend-label">{t(lang, "calLegendBest")}</span>
          </div>
          <div className="cal-legend-item">
            <div className="cal-legend-dot cal-legend-dot--watered" />
            <span className="cal-legend-label">{t(lang, "calLegendWatered")}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
