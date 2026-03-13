// src/components/LocationPicker.jsx
import React, { useEffect, useRef, useState } from "react";
import { searchLocations, reverseGeocode } from "../api/openWeatherClient";
import "./LocationPicker.css";

export default function LocationPicker({ locationName, onLocationChange }) {
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
      setGpsError("Geolocation is not supported by your browser.");
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
            setGpsError("Could not determine city from GPS.");
            setIsLocating(false);
            return;
          }

          onLocationChange(fullName);
        } catch (err) {
          console.error(err);
          setGpsError("Failed to get location from GPS.");
        } finally {
          setIsLocating(false);
        }
      },
      (err) => {
        console.error(err);
        setGpsError("Permission denied or GPS unavailable.");
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

        const results = await searchLocations(q, 6, controller.signal);
        setOptions(results);
        setIsDropdownOpen(results.length > 0);
      } catch (err) {
        if (err.name === "AbortError") return;
        console.error(err);
        setOptions([]);
        setIsDropdownOpen(false);
        setSearchError(err?.message || "Location search failed.");
      } finally {
        if (!controller.signal.aborted) setIsSearching(false);
      }
    }, 300);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [manualInput]);

  function handleSelectOption(opt) {
    // Show the friendly label in the input, but store the app-friendly value in state
    setManualInput(opt.label);
    setIsDropdownOpen(false);
    setOptions([]);
    setSearchError(null);

    // Persist selection to the app
    onLocationChange(opt.value);

    // Keep the label in the field so user sees what they picked
  }

  function handleSubmit(e) {
    e.preventDefault();

    // If we have suggestions, pick the first one on Enter
    if (options.length > 0) {
      handleSelectOption(options[0]);
      return;
    }

    if (!manualInput.trim()) return;
    onLocationChange(manualInput.trim());
    setIsDropdownOpen(false);
    setOptions([]);
    setSearchError(null);
    // Keep the typed value visible; do not clear it
  }

  return (
    <footer className="loc-footer">
      <div className="loc-title">Location</div>

      {/* Current location button */}
      <button
        type="button"
        onClick={handleUseCurrentLocation}
        disabled={isLocating}
        className="loc-gps-btn"
      >
        {isLocating ? "Detecting current location..." : "Use my current location"}
      </button>

      {gpsError && <p className="loc-gps-error">{gpsError}</p>}

      {/* Manual input */}
      <form onSubmit={handleSubmit} className="loc-form">
        <div className="loc-input-wrap">
          <input
            type="text"
            placeholder="e.g. Amsterdam"
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
              {isSearching ? "Searching…" : searchError ? `⚠️ ${searchError}` : null}
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
          Set
        </button>
      </form>

      <p className="loc-current">
        Using: <strong>{locationName}</strong>
      </p>
    </footer>
  );
}
