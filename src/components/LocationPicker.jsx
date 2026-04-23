// src/components/LocationPicker.jsx
import React, { useEffect, useRef, useState } from "react";
import { searchLocations, reverseGeocode } from "../api/openWeatherClient";
import "./LocationPicker.css";
import { t } from "../i18n";

export default function LocationPicker({ locationName, onLocationChange, lang = "en" }) {
  const [manualInput, setManualInput] = useState("");
  const [gpsError, setGpsError] = useState(null);
  const [isLocating, setIsLocating] = useState(false);

  // Autocomplete state
  const [options, setOptions] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState(null);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const debounceRef = useRef(null);
  const searchAbortRef = useRef(null);

  async function handleUseCurrentLocation() {
    setGpsError(null);

    if (!navigator.geolocation) {
      setGpsError(t(lang, "locGeoNotSupported"));
      return;
    }

    setIsLocating(true);

    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const lat = pos.coords.latitude;
          const lon = pos.coords.longitude;

          const fullName = await reverseGeocode(lat, lon);

          if (!fullName) {
            setGpsError(t(lang, "locGpsCityFailed"));
            setIsLocating(false);
            return;
          }

          onLocationChange(fullName);
        } catch (err) {
          console.error(err);
          setGpsError(t(lang, "locGpsFailed"));
        } finally {
          setIsLocating(false);
        }
      },
      (err) => {
        console.error(err);
        setGpsError(t(lang, "locPermDenied"));
        setIsLocating(false);
      }
    );
  }

  // Debounced location search for manual input
  useEffect(() => {
    const q = manualInput.trim();

    if (q.length < 2) {
      setOptions([]);
      setIsDropdownOpen(false);
      setSearchError(null);
      return;
    }

    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (searchAbortRef.current) searchAbortRef.current.abort();

    debounceRef.current = setTimeout(async () => {
      const controller = new AbortController();
      searchAbortRef.current = controller;

      try {
        setIsSearching(true);
        setSearchError(null);

        const results = await searchLocations(q, 6, controller.signal, lang);
        setOptions(results);
        setIsDropdownOpen(results.length > 0);
      } catch (err) {
        if (err.name === "AbortError") return;
        console.error(err);
        setOptions([]);
        setIsDropdownOpen(false);
        setSearchError(err?.message || t(lang, "locSearchFailed"));
      } finally {
        if (!controller.signal.aborted) setIsSearching(false);
      }
    }, 300);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [manualInput, lang]);

  function handleSelectOption(opt) {
    setManualInput(opt.label);
    setIsDropdownOpen(false);
    setOptions([]);
    setSearchError(null);
    onLocationChange(opt.value);
  }

  function handleSubmit(e) {
    e.preventDefault();

    if (options.length > 0) {
      handleSelectOption(options[0]);
      return;
    }

    if (!manualInput.trim()) return;
    onLocationChange(manualInput.trim());
    setIsDropdownOpen(false);
    setOptions([]);
    setSearchError(null);
  }

  return (
    <footer className="loc-footer">
      <div className="loc-title">{t(lang, "locTitle")}</div>

      <p className="loc-current">
        {t(lang, "locUsing").split("{name}")[0]}<strong>{locationName}</strong>
      </p>

      {/* Current location button */}
      <button
        type="button"
        onClick={handleUseCurrentLocation}
        disabled={isLocating}
        className="loc-gps-btn"
      >
        {isLocating ? t(lang, "locDetecting") : t(lang, "locUseCurrent")}
      </button>

      {gpsError && <p className="loc-gps-error">{gpsError}</p>}

      {/* Manual input */}
      <form onSubmit={handleSubmit} className="loc-form">
        <div className="loc-input-wrap">
          <input
            type="text"
            placeholder={t(lang, "locPlaceholder")}
            value={manualInput}
            onChange={(e) => setManualInput(e.target.value)}
            onFocus={() => {
              if (options.length > 0) setIsDropdownOpen(true);
            }}
            onBlur={() => {
              // allow click selection before closing
              setTimeout(() => setIsDropdownOpen(false), 150);
            }}
            className="loc-input"
          />

          {(isSearching || searchError) && (
            <div className="loc-search-status">
              {isSearching ? t(lang, "locSearching") : searchError ? `⚠️ ${searchError}` : null}
            </div>
          )}

          {isDropdownOpen && options.length > 0 && (
            <div className="loc-dropdown">
              {options.map((opt) => (
                <button
                  key={`${opt.value}-${opt.lat}-${opt.lon}`}
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => handleSelectOption(opt)}
                  className="loc-dropdown-item"
                >
                  {opt.label}
                </button>
              ))}
            </div>
          )}
        </div>
        <button type="submit" className="loc-submit-btn">
          {t(lang, "locSet")}
        </button>
      </form>

    </footer>
  );
}
