// src/components/LocationPicker.jsx
import React, { useEffect, useRef, useState } from "react";
import { searchLocations, reverseGeocode } from "../api/openWeatherClient";

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

    debounceRef.current = setTimeout(async () => {
      try {
        setIsSearching(true);
        setSearchError(null);

        const results = await searchLocations(q, 6);
        setOptions(results);
        setIsDropdownOpen(results.length > 0);
      } catch (err) {
        console.error(err);
        setOptions([]);
        setIsDropdownOpen(false);
        setSearchError(err?.message || "Location search failed.");
      } finally {
        setIsSearching(false);
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
    <footer
      style={{
        marginTop: "auto",
        padding: "0.75rem 1rem",
        borderTop: "1px solid #e5e7eb",
        background: "#f9fafb",
        fontSize: "0.9rem",
      }}
    >
      <div style={{ marginBottom: "0.5rem", fontWeight: 600 }}>Location</div>

      {/* Current location button */}
      <button
        type="button"
        onClick={handleUseCurrentLocation}
        disabled={isLocating}
        style={{
          width: "100%",
          padding: "0.45rem 0.8rem",
          borderRadius: "999px",
          border: "none",
          background: "#10b981",
          color: "#fff",
          fontWeight: 500,
          cursor: "pointer",
          marginBottom: "0.5rem",
        }}
      >
        {isLocating ? "Detecting current location..." : "Use my current location"}
      </button>

      {gpsError && (
        <p style={{ color: "#b91c1c", fontSize: "0.8rem", marginBottom: "0.4rem" }}>
          {gpsError}
        </p>
      )}

      {/* Manual input */}
      <form
        onSubmit={handleSubmit}
        style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}
      >
        <div style={{ position: "relative", flex: 1 }}>
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
            style={{
              width: "100%",
              padding: "0.4rem 0.6rem",
              borderRadius: "999px",
              border: "1px solid #d1d5db",
            }}
          />

          {(isSearching || searchError) && (
            <div style={{ marginTop: "0.35rem", fontSize: "0.75rem", color: "#6b7280" }}>
              {isSearching ? "Searching…" : searchError ? `⚠️ ${searchError}` : null}
            </div>
          )}

          {isDropdownOpen && options.length > 0 && (
            <div
              style={{
                position: "absolute",
                left: 0,
                right: 0,
                top: "2.35rem",
                zIndex: 20,
                background: "#fff",
                border: "1px solid #e5e7eb",
                borderRadius: "12px",
                boxShadow: "0 8px 20px rgba(0,0,0,0.08)",
                overflow: "hidden",
              }}
            >
              {options.map((opt) => (
                <button
                  key={`${opt.value}-${opt.lat}-${opt.lon}`}
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => handleSelectOption(opt)}
                  style={{
                    width: "100%",
                    textAlign: "left",
                    padding: "0.55rem 0.75rem",
                    border: "none",
                    background: "#fff",
                    cursor: "pointer",
                    fontSize: "0.9rem",
                  }}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          )}
        </div>
        <button
          type="submit"
          style={{
            padding: "0.4rem 0.9rem",
            borderRadius: "999px",
            border: "none",
            background: "#3b82f6",
            color: "#fff",
            fontWeight: 500,
            cursor: "pointer",
            whiteSpace: "nowrap",
          }}
        >
          Set
        </button>
      </form>

      <p
        style={{
          marginTop: "0.4rem",
          fontSize: "0.8rem",
          color: "#6b7280",
        }}
      >
        Using: <strong>{locationName}</strong>
      </p>
    </footer>
  );
}