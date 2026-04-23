import React from "react";
import LocationPicker from "./LocationPicker";
import { t } from "../i18n";
import "./SettingsScreen.css";

export const SOIL_OPTIONS = [
  { value: "unknown", multiplier: 1.0 },
  { value: "sandy",   multiplier: 1.3 },
  { value: "loamy",   multiplier: 1.0 },
  { value: "clay",    multiplier: 0.7 },
  { value: "chalky",  multiplier: 1.1 },
  { value: "peat",    multiplier: 0.6 },
];

export function getSoilMultiplier(soilType) {
  return SOIL_OPTIONS.find((o) => o.value === soilType)?.multiplier ?? 1.0;
}

/**
 * @param {Object} props
 * @param {string} props.locationName
 * @param {(name: string) => void} props.onLocationChange
 * @param {string} props.soilType - one of SOIL_OPTIONS values
 * @param {(soilType: string) => void} props.onSoilTypeChange
 * @param {number} props.sensitivity - integer −50 … +50 (stored as percentage offset)
 * @param {(value: number) => void} props.onSensitivityChange
 * @param {boolean} props.pushEnabled
 * @param {boolean} props.pushIsLoading
 * @param {(enabled: boolean) => void} props.onTogglePush
 * @param {string} props.lang
 * @param {(lang: string) => void} props.onSetLang
 */
export function SettingsScreen({
  locationName,
  onLocationChange,
  soilType = "unknown",
  onSoilTypeChange,
  sensitivity = 0,
  onSensitivityChange,
  pushEnabled,
  pushIsLoading,
  onTogglePush,
  lang = "en",
  onSetLang,
}) {
  return (
    <div className="settings-screen">

      {/* ── HERO ── */}
      <div className="settings-hero">
        <div className="settings-hero-top-row">
          <div className="settings-lang-toggle">
            <button
              type="button"
              className={`settings-lang-btn${lang === "en" ? " settings-lang-btn--active" : ""}`}
              onClick={() => onSetLang?.("en")}
            >EN</button>
            <button
              type="button"
              className={`settings-lang-btn${lang === "nl" ? " settings-lang-btn--active" : ""}`}
              onClick={() => onSetLang?.("nl")}
            >NL</button>
          </div>
        </div>
        <h1 className="settings-hero-heading">{t(lang, "settingsHeroHeading")}</h1>
        <div className="settings-hero-sub">{t(lang, "settingsHeroSub")}</div>
      </div>

      {/* ── CONTENT ── */}
      <div className="settings-content">

        {/* Location */}
        <div className="settings-section-label">{t(lang, "locTitle")}</div>
        <div className="settings-card">
          <LocationPicker
            locationName={locationName}
            onLocationChange={onLocationChange}
            lang={lang}
          />
        </div>

        {/* Soil type */}
        <div className="settings-section-label">{t(lang, "settingsSoilType")}</div>
        <div className="settings-card">
          <div className="settings-card-desc">{t(lang, "settingsSoilTypeSub")}</div>
          <select
            className="settings-select"
            value={soilType}
            onChange={(e) => onSoilTypeChange?.(e.target.value)}
          >
            {SOIL_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {t(lang, `soil${o.value.charAt(0).toUpperCase() + o.value.slice(1)}`)}
              </option>
            ))}
          </select>
        </div>

        {/* Push notifications */}
        <div className="settings-section-label">{t(lang, "reminders")}</div>
        <div
          role="button"
          aria-pressed={!!pushEnabled}
          onClick={() => {
            if (pushIsLoading) return;
            onTogglePush?.(!pushEnabled);
          }}
          className={`settings-notif-card${pushIsLoading ? " settings-notif-card--loading" : ""}`}
        >
          <div className="settings-notif-info">
            <div className="settings-notif-title">{t(lang, "pushNotifications")}</div>
            <div className="settings-notif-sub">{t(lang, "pushNotificationsSub")}</div>
          </div>
          <div className={`settings-toggle${pushEnabled ? " settings-toggle--on" : ""}`} />
        </div>
        <div aria-live="polite" className="settings-push-status">
          {pushIsLoading ? t(lang, "saving") : ""}
        </div>

        {/* Sensitivity */}
        <div className="settings-section-label">{t(lang, "settingsSensitivity")}</div>
        <div className="settings-card">
          <div className="settings-card-desc">{t(lang, "settingsSensitivitySub")}</div>
          <div className="settings-slider-row">
            <span className="settings-slider-label">{t(lang, "settingsSensitivityLess")}</span>
            <div className="settings-slider-wrap">
              <input
                type="range"
                className="settings-slider"
                min={-50}
                max={50}
                step={5}
                value={sensitivity}
                onChange={(e) => onSensitivityChange?.(Number(e.target.value))}
              />
              <div
                className="settings-slider-value"
                style={{ left: `${((sensitivity + 50) / 100) * 100}%` }}
              >
                {sensitivity === 0
                  ? (lang === "nl" ? "Standaard" : "Default")
                  : sensitivity > 0
                    ? `+${sensitivity}%`
                    : `${sensitivity}%`}
              </div>
            </div>
            <span className="settings-slider-label">{t(lang, "settingsSensitivityMore")}</span>
          </div>
        </div>

      </div>
    </div>
  );
}
