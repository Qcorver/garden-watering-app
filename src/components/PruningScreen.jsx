import React, { useState, useEffect, useRef } from "react";
import { searchPlants, getPlantDetails } from "../api/perenualClient";
import { compressImage, identifyPlant } from "../api/plantIdentifyClient";
import "./PruningScreen.css";
import { t, strings } from "../i18n";

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Deduplicate plant search results by genus+species (first two words of
 * scientific name), keeping the first (most popular) entry per species.
 * Limits to `max` results so amateur gardeners see only the top options.
 */
function deduplicateBySpecies(plants, max = 3) {
  const seen = new Set();
  const out = [];
  for (const plant of plants) {
    const sciName = Array.isArray(plant.scientific_name)
      ? plant.scientific_name[0]
      : plant.scientific_name ?? "";
    // Use genus + species (first two words), ignore cultivar suffix
    const key = sciName.split(" ").slice(0, 2).join(" ").toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(plant);
    if (out.length >= max) break;
  }
  return out;
}

// ── Constants ────────────────────────────────────────────────────────────────

// Always English — used as data keys for matching Perenual API data
const MONTH_NAMES_EN = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const MONTH_ABBR_EN = [
  "J", "F", "M", "A", "M", "J", "J", "A", "S", "O", "N", "D",
];

// ── localStorage helpers ──────────────────────────────────────────────────────

function loadGardenPlants() {
  try {
    const raw = localStorage.getItem("gardenPlants");
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveGardenPlants(plants) {
  try {
    localStorage.setItem("gardenPlants", JSON.stringify(plants));
  } catch { /* ignore */ }
}

// ── Sorting / status helpers ──────────────────────────────────────────────────

function monthsUntilNextPruning(pruningMonths, currentMonthIdx) {
  if (!pruningMonths || pruningMonths.length === 0) return 13;
  const indices = pruningMonths
    .map((m) => MONTH_NAMES_EN.indexOf(m))
    .filter((i) => i >= 0);
  if (indices.length === 0) return 13;
  return Math.min(...indices.map((m) => (m - currentMonthIdx + 12) % 12));
}

function sortPlants(plants) {
  const currentMonth = new Date().getMonth();
  return [...plants].sort((a, b) => {
    const da = monthsUntilNextPruning(a.pruningMonths, currentMonth);
    const db = monthsUntilNextPruning(b.pruningMonths, currentMonth);
    return da - db;
  });
}

/** Returns 'now' if current month is in pruning window, 'soon' if next month, else null */
function getPruningStatus(pruningMonths) {
  if (!pruningMonths || pruningMonths.length === 0) return null;
  const cur = new Date().getMonth();
  const indices = pruningMonths.map((m) => MONTH_NAMES_EN.indexOf(m)).filter((i) => i >= 0);
  if (indices.includes(cur)) return "now";
  if (indices.includes((cur + 1) % 12)) return "soon";
  return null;
}

// ── Sub-components ────────────────────────────────────────────────────────────

function MonthBlocks({ pruningMonths, large = false }) {
  const currentMonth = new Date().getMonth();
  return (
    <div className={`pruning-month-blocks${large ? " pruning-month-blocks--large" : ""}`}>
      {MONTH_ABBR_EN.map((abbr, i) => {
        const isPruning = pruningMonths?.includes(MONTH_NAMES_EN[i]);
        const isCurrent = i === currentMonth;
        return (
          <div
            key={i}
            className={[
              "pruning-month-block",
              isPruning ? "pruning-month-block--active" : "",
              isCurrent ? "pruning-month-block--current" : "",
            ].join(" ")}
            title={MONTH_NAMES_EN[i]}
          >
            {large && <span className="pruning-month-block-label">{abbr}</span>}
          </div>
        );
      })}
    </div>
  );
}

function PlantThumbnail({ imageUrl, commonName }) {
  const [failed, setFailed] = useState(false);
  if (!imageUrl || failed) {
    return <div className="pruning-plant-thumb pruning-plant-thumb--fallback">🌿</div>;
  }
  return (
    <img
      className="pruning-plant-thumb"
      src={imageUrl}
      alt={commonName}
      onError={() => setFailed(true)}
    />
  );
}

// ── Custom select (avoids iOS native picker / keyboard jump bug) ──────────────

function CustomSelect({ value, onChange, options }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const selected = options.find((o) => o.value === value) ?? options[0];

  useEffect(() => {
    if (!open) return;
    function handleOutside(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener("mousedown", handleOutside);
    document.addEventListener("touchstart", handleOutside);
    return () => {
      document.removeEventListener("mousedown", handleOutside);
      document.removeEventListener("touchstart", handleOutside);
    };
  }, [open]);

  return (
    <div className={`pruning-custom-select${open ? " pruning-custom-select--open" : ""}`} ref={ref}>
      <button
        type="button"
        className="pruning-custom-select-btn"
        onClick={() => setOpen((v) => !v)}
      >
        <span>{selected.icon} {selected.label}</span>
        <svg className="pruning-custom-select-arrow" width="12" height="8" viewBox="0 0 12 8" fill="none">
          <path d="M1 1l5 5 5-5" stroke="#9aab94" strokeWidth="1.5" strokeLinecap="round"/>
        </svg>
      </button>
      {open && (
        <div className="pruning-custom-select-menu">
          {options.map((o) => (
            <button
              key={o.value}
              type="button"
              className={`pruning-custom-select-option${o.value === value ? " pruning-custom-select-option--selected" : ""}`}
              onClick={() => { onChange(o.value); setOpen(false); }}
            >
              {o.value === value && <span className="pruning-custom-select-check">✓</span>}
              {o.icon} {o.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Context menu (3-dot) ──────────────────────────────────────────────────────

function ContextMenu({ onEdit, onRemove, onClose, lang }) {
  const ref = useRef(null);

  useEffect(() => {
    function handleClick(e) {
      if (ref.current && !ref.current.contains(e.target)) onClose();
    }
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("touchstart", handleClick);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("touchstart", handleClick);
    };
  }, [onClose]);

  return (
    <div className="pruning-context-menu" ref={ref}>
      <button
        type="button"
        className="pruning-context-item"
        onClick={() => { onEdit(); onClose(); }}
      >
        {t(lang, "pruneEdit")}
      </button>
      <button
        type="button"
        className="pruning-context-item pruning-context-item--danger"
        onClick={() => { onRemove(); onClose(); }}
      >
        {t(lang, "pruneRemove")}
      </button>
    </div>
  );
}

// ── Plant row ─────────────────────────────────────────────────────────────────

function PlantRow({ plant, onTap, onEdit, onRemove, lang }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const status = getPruningStatus(plant.pruningMonths);

  return (
    <div className="pruning-plant-row" onClick={() => !menuOpen && onTap(plant)}>
      <PlantThumbnail imageUrl={plant.imageUrl} commonName={plant.commonName} />

      <div className="pruning-plant-info">
        <div className="pruning-plant-name-row">
          <span className="pruning-plant-name">{plant.commonName}</span>
          {status === "now" && (
            <span className="pruning-status-badge pruning-status-badge--now">{t(lang, "pruneNow")}</span>
          )}
          {status === "soon" && (
            <span className="pruning-status-badge pruning-status-badge--soon">{t(lang, "pruneNextMonth")}</span>
          )}
        </div>
        <span className="pruning-plant-scientific">{plant.scientificName}</span>
        <MonthBlocks pruningMonths={plant.pruningMonths} />
      </div>

      <div className="pruning-dots-wrap" onClick={(e) => e.stopPropagation()}>
        <button
          type="button"
          className="pruning-dots-btn"
          onClick={() => setMenuOpen((v) => !v)}
          aria-label={t(lang, "pruneOptionsAriaLabel")}
        >
          ⋮
        </button>
        {menuOpen && (
          <ContextMenu
            onEdit={() => onEdit(plant)}
            onRemove={() => onRemove(plant.id)}
            onClose={() => setMenuOpen(false)}
            lang={lang}
          />
        )}
      </div>
    </div>
  );
}

// ── Plant detail popup ────────────────────────────────────────────────────────

function PlantDetailPopup({ plant, onClose, lang }) {
  const pruningText = plant.pruningMonths?.length
    ? plant.pruningMonths.join(", ")
    : t(lang, "pruneNoData");

  const lightOptions = [
    { value: "sun",        label: t(lang, "lightFullSun"),   icon: "☀️" },
    { value: "half-shade", label: t(lang, "lightHalfShade"), icon: "⛅" },
    { value: "shade",      label: t(lang, "lightShade"),     icon: "🌚" },
  ];

  return (
    <div className="pruning-overlay" onClick={onClose}>
      <div className="pruning-detail-sheet" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="pruning-sheet-close" onClick={onClose}>✕</button>

        <div className="pruning-detail-image-wrap">
          <PlantThumbnail imageUrl={plant.imageUrl} commonName={plant.commonName} />
        </div>

        <div className="pruning-detail-body">
          <h2 className="pruning-detail-name">{plant.commonName}</h2>
          <p className="pruning-detail-scientific">{plant.scientificName}</p>

          <div className="pruning-detail-section">
            <span className="pruning-detail-label">{t(lang, "pruneWindowLabel")}</span>
            <MonthBlocks pruningMonths={plant.pruningMonths} large />
            <span className="pruning-detail-months">{pruningText}</span>
          </div>

          <div className="pruning-detail-grid">
            {plant.cycle && (
              <div className="pruning-detail-cell">
                <span className="pruning-detail-cell-label">{t(lang, "pruneCycle")}</span>
                <span className="pruning-detail-cell-value">{plant.cycle}</span>
              </div>
            )}
            {plant.maintenance && (
              <div className="pruning-detail-cell">
                <span className="pruning-detail-cell-label">{t(lang, "pruneMaintenance")}</span>
                <span className="pruning-detail-cell-value">{plant.maintenance}</span>
              </div>
            )}
            {plant.sunlight?.length > 0 && (
              <div className="pruning-detail-cell pruning-detail-cell--wide">
                <span className="pruning-detail-cell-label">{t(lang, "pruneSunlight")}</span>
                <span className="pruning-detail-cell-value">{plant.sunlight.join(", ")}</span>
              </div>
            )}
            {plant.lightCondition && (
              <div className="pruning-detail-cell">
                <span className="pruning-detail-cell-label">{t(lang, "pruneYourSetting")}</span>
                <span className="pruning-detail-cell-value">
                  {lightOptions.find((o) => o.value === plant.lightCondition)?.icon}{" "}
                  {lightOptions.find((o) => o.value === plant.lightCondition)?.label}
                </span>
              </div>
            )}
            <div className="pruning-detail-cell">
              <span className="pruning-detail-cell-label">{t(lang, "pruneLocation")}</span>
              <span className="pruning-detail-cell-value">
                {plant.inPot ? t(lang, "pruneInPot") : t(lang, "pruneInGround")}
              </span>
            </div>
          </div>

          {plant.description && (
            <p className="pruning-detail-description">{plant.description}</p>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Add / Edit plant popup ────────────────────────────────────────────────────

function AddPlantPopup({ initialPlant, onSave, onClose, lang }) {
  const isEditing = !!initialPlant;

  const lightOptions = [
    { value: "sun",        label: t(lang, "lightFullSun"),   icon: "☀️" },
    { value: "half-shade", label: t(lang, "lightHalfShade"), icon: "⛅" },
    { value: "shade",      label: t(lang, "lightShade"),     icon: "🌚" },
  ];
  const locationOptions = [
    { value: "ground", label: t(lang, "locationInGround"), icon: "🌱" },
    { value: "pot",    label: t(lang, "locationInPot"),    icon: "🪴" },
  ];

  const [query, setQuery] = useState(isEditing ? initialPlant.commonName : "");
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [selectedSpecies, setSelectedSpecies] = useState(
    isEditing ? {
      id: initialPlant.perenualId,
      commonName: initialPlant.commonName,
      scientificName: initialPlant.scientificName,
      pruningMonths: initialPlant.pruningMonths,
      imageUrl: initialPlant.imageUrl,
      sunlight: initialPlant.sunlight,
      cycle: initialPlant.cycle,
      maintenance: initialPlant.maintenance,
      description: initialPlant.description,
    } : null
  );
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [lightCondition, setLightCondition] = useState(initialPlant?.lightCondition ?? "sun");
  const [inPot, setInPot] = useState(initialPlant?.inPot ?? false);

  const [recognizing, setRecognizing] = useState(false);
  const [recognitionMatches, setRecognitionMatches] = useState(null); // null = not yet run
  const [recognitionError, setRecognitionError] = useState(null);

  const debounceRef = useRef(null);
  const abortRef = useRef(null);
  const cameraInputRef = useRef(null);

  // Debounced search
  useEffect(() => {
    if (selectedSpecies) return; // don't search after selection
    clearTimeout(debounceRef.current);

    if (query.trim().length < 2) {
      setResults([]);
      return;
    }

    debounceRef.current = setTimeout(async () => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      setSearching(true);
      try {
        const data = await searchPlants(query, controller.signal, lang);
        setResults(deduplicateBySpecies(data, 3));
      } catch (e) {
        if (e.name !== "AbortError") setResults([]);
      } finally {
        setSearching(false);
      }
    }, 400);

    return () => clearTimeout(debounceRef.current);
  }, [query, selectedSpecies]);

  async function handleSelectResult(item) {
    setResults([]);
    setLoadingDetails(true);

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const details = await getPlantDetails(item.id, controller.signal, lang);
      setSelectedSpecies({
        id: item.id,
        commonName: details.common_name ?? item.common_name,
        scientificName: Array.isArray(details.scientific_name)
          ? details.scientific_name[0]
          : details.scientific_name ?? "",
        pruningMonths: details.pruning_month ?? [],
        imageUrl: details.default_image?.medium_url ?? details.default_image?.thumbnail ?? null,
        sunlight: details.sunlight ?? [],
        cycle: details.cycle ?? null,
        maintenance: details.maintenance ?? null,
        description: details.description ?? null,
      });
      setQuery(details.common_name ?? item.common_name);
    } catch (e) {
      if (e.name !== "AbortError") {
        // Fall back to list data without pruning months
        setSelectedSpecies({
          id: item.id,
          commonName: item.common_name,
          scientificName: Array.isArray(item.scientific_name)
            ? item.scientific_name[0]
            : item.scientific_name ?? "",
          pruningMonths: [],
          imageUrl: item.default_image?.thumbnail ?? null,
          sunlight: [],
          cycle: item.cycle ?? null,
          maintenance: null,
          description: null,
        });
        setQuery(item.common_name);
      }
    } finally {
      setLoadingDetails(false);
    }
  }

  function handleClearSelection() {
    setSelectedSpecies(null);
    setQuery("");
    setResults([]);
    setRecognitionMatches(null);
    setRecognitionError(null);
  }

  async function handleCameraCapture(file) {
    if (!file) return;
    setRecognizing(true);
    setRecognitionMatches(null);
    setRecognitionError(null);
    setResults([]);
    setSelectedSpecies(null);
    setQuery("");

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const base64 = await compressImage(file);
      const matches = await identifyPlant(base64, controller.signal, lang);
      setRecognitionMatches(matches);
    } catch (e) {
      if (e.name !== "AbortError") {
        setRecognitionError(t(lang, "pruneRecognitionError"));
      }
    } finally {
      setRecognizing(false);
    }
  }

  async function handleSelectRecognitionMatch(match) {
    setRecognitionMatches(null);
    if (match.dbId) {
      await handleSelectResult({ id: match.dbId });
    } else {
      // Plant not in our DB — pre-fill search so user can try manually
      setQuery(match.scientificName);
    }
  }

  function handleSave() {
    if (!selectedSpecies) return;
    onSave({
      id: initialPlant?.id ?? crypto.randomUUID(),
      perenualId: selectedSpecies.id,
      commonName: selectedSpecies.commonName,
      scientificName: selectedSpecies.scientificName,
      pruningMonths: selectedSpecies.pruningMonths,
      imageUrl: selectedSpecies.imageUrl,
      sunlight: selectedSpecies.sunlight,
      cycle: selectedSpecies.cycle,
      maintenance: selectedSpecies.maintenance,
      description: selectedSpecies.description,
      lightCondition,
      inPot,
    });
  }

  const canSave = !!selectedSpecies && !loadingDetails;

  return (
    <div className="pruning-overlay" onClick={onClose}>
      <div className="pruning-add-sheet" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="pruning-add-header">
          <h3 className="pruning-add-title">{isEditing ? t(lang, "pruneEditTitle") : t(lang, "pruneAddTitle")}</h3>
          <button type="button" className="pruning-sheet-close" onClick={onClose}>✕</button>
        </div>

        {/* Search */}
        <div className="pruning-add-body">
          {/* Hidden file input for camera */}
          <input
            ref={cameraInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            style={{ display: "none" }}
            onChange={(e) => handleCameraCapture(e.target.files?.[0])}
          />

          <div className="pruning-search-wrap">
            <span className="pruning-search-icon">🔍</span>
            <input
              className="pruning-search-input"
              type="text"
              placeholder={t(lang, "pruneSearchPlaceholder")}
              value={query}
              onChange={(e) => {
                if (selectedSpecies) handleClearSelection();
                setQuery(e.target.value);
              }}
              autoFocus={!isEditing}
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck={false}
            />
            {selectedSpecies ? (
              <button
                type="button"
                className="pruning-search-clear"
                onClick={handleClearSelection}
              >
                ✕
              </button>
            ) : (
              <button
                type="button"
                className="pruning-camera-btn"
                aria-label={t(lang, "pruneCameraAriaLabel")}
                onClick={() => cameraInputRef.current?.click()}
              >
                📷
              </button>
            )}
          </div>

          {/* Recognizing spinner */}
          {recognizing && (
            <div className="pruning-loading-details">
              <div className="pruning-spinner" />
              <span>{t(lang, "pruneRecognizing")}</span>
            </div>
          )}

          {/* Recognition error */}
          {recognitionError && (
            <div className="pruning-recognition-error">{recognitionError}</div>
          )}

          {/* Recognition results */}
          {recognitionMatches && !recognizing && (
            <div className="pruning-search-results">
              <div className="pruning-recognition-label">{t(lang, "pruneRecognitionResults")}</div>
              {recognitionMatches.map((match) => (
                <button
                  key={match.scientificName}
                  type="button"
                  className="pruning-search-result-item"
                  onClick={() => handleSelectRecognitionMatch(match)}
                >
                  <div className="pruning-result-row">
                    <span className="pruning-result-name">
                      {match.commonName ?? match.scientificName}
                    </span>
                    <span className="pruning-confidence-badge">
                      {match.score}%
                    </span>
                    {!match.dbId && (
                      <span className="pruning-recognition-not-in-db">
                        {t(lang, "pruneRecognitionNotInDb")}
                      </span>
                    )}
                  </div>
                  <span className="pruning-result-sci">{match.scientificName}</span>
                </button>
              ))}
            </div>
          )}

          {/* Search results */}
          {results.length > 0 && !selectedSpecies && !recognitionMatches && (
            <div className="pruning-search-results">
              {searching && <div className="pruning-search-spinner">{t(lang, "pruneSearching")}</div>}
              {results.map((item, index) => (
                <button
                  key={item.id}
                  type="button"
                  className="pruning-search-result-item"
                  onClick={() => handleSelectResult(item)}
                >
                  <div className="pruning-result-row">
                    <span className="pruning-result-name">{item.common_name}</span>
                    {index === 0 && <span className="pruning-result-popular">{t(lang, "pruneMostCommon")}</span>}
                  </div>
                  <span className="pruning-result-sci">
                    {Array.isArray(item.scientific_name)
                      ? item.scientific_name[0]
                      : item.scientific_name}
                  </span>
                </button>
              ))}
            </div>
          )}

          {searching && results.length === 0 && !selectedSpecies && (
            <div className="pruning-search-spinner">{t(lang, "pruneSearching")}</div>
          )}

          {/* Loading details */}
          {loadingDetails && (
            <div className="pruning-loading-details">
              <div className="pruning-spinner" />
              <span>{t(lang, "pruneLoadingDetails")}</span>
            </div>
          )}

          {/* Selected species card */}
          {selectedSpecies && !loadingDetails && (
            <div className="pruning-selected-card">
              <div className="pruning-selected-image-wrap">
                <PlantThumbnail
                  imageUrl={selectedSpecies.imageUrl}
                  commonName={selectedSpecies.commonName}
                />
              </div>
              <div className="pruning-selected-info">
                <span className="pruning-selected-name">{selectedSpecies.commonName}</span>
                <span className="pruning-selected-sci">{selectedSpecies.scientificName}</span>
                {selectedSpecies.pruningMonths?.length > 0 ? (
                  <>
                    <span className="pruning-selected-prune-label">{t(lang, "pruneWindowLabel")}</span>
                    <MonthBlocks pruningMonths={selectedSpecies.pruningMonths} />
                    <span className="pruning-selected-prune-months">
                      {selectedSpecies.pruningMonths.join(", ")}
                    </span>
                  </>
                ) : (
                  <span className="pruning-selected-no-data">{t(lang, "pruneNoDataAvailable")}</span>
                )}
              </div>
            </div>
          )}

          {/* Dropdowns */}
          <div className="pruning-dropdowns">
            <div className="pruning-dropdown-group">
              <label className="pruning-dropdown-label">{t(lang, "pruneLightLabel")}</label>
              <CustomSelect
                value={lightCondition}
                onChange={setLightCondition}
                options={lightOptions}
              />
            </div>
            <div className="pruning-dropdown-group">
              <label className="pruning-dropdown-label">{t(lang, "pruneLocationLabel")}</label>
              <CustomSelect
                value={inPot ? "pot" : "ground"}
                onChange={(v) => setInPot(v === "pot")}
                options={locationOptions}
              />
            </div>
          </div>
        </div>

        {/* Footer buttons */}
        <div className="pruning-add-footer">
          <button type="button" className="pruning-btn-cancel" onClick={onClose}>
            {t(lang, "pruneCancel")}
          </button>
          <button
            type="button"
            className={`pruning-btn-save${canSave ? "" : " pruning-btn-save--disabled"}`}
            disabled={!canSave}
            onClick={handleSave}
          >
            {t(lang, "pruneSave")}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main screen ───────────────────────────────────────────────────────────────

export function PruningScreen({ onSyncPlants, lang = "en" }) {
  const [plants, setPlants] = useState(() => sortPlants(loadGardenPlants()));
  const [detailPlant, setDetailPlant] = useState(null);
  const [addPopupOpen, setAddPopupOpen] = useState(false);
  const [editingPlant, setEditingPlant] = useState(null);

  // Persist + sync on every change
  useEffect(() => {
    saveGardenPlants(plants);
    onSyncPlants?.(plants);
  }, [plants, onSyncPlants]);

  function handleSavePlant(plantData) {
    setPlants((prev) => {
      const exists = prev.some((p) => p.id === plantData.id);
      const updated = exists
        ? prev.map((p) => (p.id === plantData.id ? plantData : p))
        : [...prev, plantData];
      return sortPlants(updated);
    });
    setAddPopupOpen(false);
    setEditingPlant(null);
  }

  function handleRemovePlant(id) {
    setPlants((prev) => prev.filter((p) => p.id !== id));
  }

  function handleEdit(plant) {
    setEditingPlant(plant);
    setAddPopupOpen(true);
  }

  const currentMonthName = strings[lang]?.monthNames[new Date().getMonth()]
    ?? MONTH_NAMES_EN[new Date().getMonth()];

  return (
    <div className="pruning-screen">
      {/* Hero */}
      <header className="pruning-hero">
        <p className="pruning-hero-app-title">{t(lang, "pruneAppTitle")}</p>
        <div className="pruning-hero-title-row">
          <div>
            <h1 className="pruning-hero-heading">{t(lang, "pruneHeroHeading")}</h1>
            <p className="pruning-hero-sub">{t(lang, "pruneHeroSub")}</p>
          </div>
          <div className="pruning-hero-month-badge">
            <img src="/hedgetrimmer3.png" alt="" className="pruning-hero-scissors" />
            <span className="pruning-hero-month">{currentMonthName}</span>
          </div>
        </div>
      </header>

      {/* Plant list */}
      <div className="pruning-content">
        {plants.length === 0 ? (
          <div className="pruning-empty">
            <div className="pruning-empty-icon">🌿</div>
            <p className="pruning-empty-title">{t(lang, "pruneEmptyTitle")}</p>
            <p className="pruning-empty-sub">{t(lang, "pruneEmptySub")}</p>
          </div>
        ) : (
          <div className="pruning-plant-list">
            {plants.map((plant) => (
              <PlantRow
                key={plant.id}
                plant={plant}
                onTap={setDetailPlant}
                onEdit={handleEdit}
                onRemove={handleRemovePlant}
                lang={lang}
              />
            ))}
          </div>
        )}
      </div>

      {/* FAB */}
      <button
        type="button"
        className="pruning-fab"
        onClick={() => { setEditingPlant(null); setAddPopupOpen(true); }}
        aria-label={t(lang, "pruneAddAriaLabel")}
      >
        +
      </button>

      {/* Detail popup */}
      {detailPlant && (
        <PlantDetailPopup plant={detailPlant} onClose={() => setDetailPlant(null)} lang={lang} />
      )}

      {/* Add / Edit popup */}
      {addPopupOpen && (
        <AddPlantPopup
          initialPlant={editingPlant}
          onSave={handleSavePlant}
          onClose={() => { setAddPopupOpen(false); setEditingPlant(null); }}
          lang={lang}
        />
      )}
    </div>
  );
}
