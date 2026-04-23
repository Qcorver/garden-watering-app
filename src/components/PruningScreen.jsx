import React, { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { searchPlants, getPlantDetails, enrichPlant } from "../api/perenualClient";
import { compressImage, identifyPlant } from "../api/plantIdentifyClient";
import "./PruningScreen.css";
import { t, strings, translatePlantValue } from "../i18n";

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
export const MONTH_NAMES_EN = [
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

// ── Hemisphere helpers ────────────────────────────────────────────────────────

/**
 * Perenual data is Northern-Hemisphere-centric. For Southern Hemisphere users
 * (latitude < 0) we shift every pruning month by 6 so the seasons align.
 * e.g. stored "March" (NH autumn) → displayed as "September" (SH autumn).
 */
export function shiftMonth6(monthName) {
  const idx = MONTH_NAMES_EN.indexOf(monthName);
  if (idx === -1) return monthName;
  return MONTH_NAMES_EN[(idx + 6) % 12];
}

export function adaptPruningMonths(months, isSH) {
  if (!isSH || !months) return months;
  return months.map(shiftMonth6);
}

// ── Sorting / status helpers ──────────────────────────────────────────────────

export function monthsUntilNextPruning(pruningMonths, currentMonthIdx) {
  if (!pruningMonths || pruningMonths.length === 0) return 13;
  const indices = pruningMonths
    .map((m) => MONTH_NAMES_EN.indexOf(m))
    .filter((i) => i >= 0);
  if (indices.length === 0) return 13;
  return Math.min(...indices.map((m) => (m - currentMonthIdx + 12) % 12));
}

export function sortPlants(plants, isSH = false) {
  const currentMonth = new Date().getMonth();
  return [...plants].sort((a, b) => {
    const da = monthsUntilNextPruning(adaptPruningMonths(a.pruningMonths, isSH), currentMonth);
    const db = monthsUntilNextPruning(adaptPruningMonths(b.pruningMonths, isSH), currentMonth);
    return da - db;
  });
}

/**
 * Auto-detect watering category from plant fields.
 * Priority: inPot > tree cycle > low maintenance > annual/biennial > border (default).
 */
export function detectWaterCategory(plant) {
  if (plant.inPot) return "pots";
  const cycle = (plant.cycle ?? "").toLowerCase();
  const maintenance = (plant.maintenance ?? "").toLowerCase();
  if (cycle.includes("tree")) return "trees";
  if (maintenance === "low") return "drought";
  if (cycle.includes("annual") || cycle.includes("biennial")) return "vegetable";
  return "border";
}

/** Returns 'now' if current month is in pruning window, 'soon' if next month, else null */
export function getPruningStatus(pruningMonths, isSH = false) {
  if (!pruningMonths || pruningMonths.length === 0) return null;
  const adapted = adaptPruningMonths(pruningMonths, isSH);
  const cur = new Date().getMonth();
  const indices = adapted.map((m) => MONTH_NAMES_EN.indexOf(m)).filter((i) => i >= 0);
  if (indices.includes(cur)) return "now";
  if (indices.includes((cur + 1) % 12)) return "soon";
  return null;
}

// ── Sub-components ────────────────────────────────────────────────────────────

export function MonthBlocks({ pruningMonths, large = false, isSH = false }) {
  const currentMonth = new Date().getMonth();
  const adapted = adaptPruningMonths(pruningMonths, isSH);
  return (
    <div className={`pruning-month-blocks${large ? " pruning-month-blocks--large" : ""}`}>
      {MONTH_ABBR_EN.map((abbr, i) => {
        const isPruning = adapted?.includes(MONTH_NAMES_EN[i]);
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

export function PlantThumbnail({ imageUrl, commonName }) {
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

export function CustomSelect({ value, onChange, options, placeholder = null, openUp = false }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const selected = options.find((o) => o.value === value) ?? null;

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
    <div className={`pruning-custom-select${open ? " pruning-custom-select--open" : ""}${openUp ? " pruning-custom-select--up" : ""}`} ref={ref}>
      <button
        type="button"
        className={`pruning-custom-select-btn${!selected ? " pruning-custom-select-btn--placeholder" : ""}`}
        onClick={() => setOpen((v) => !v)}
      >
        <span>{selected ? (selected.icon ? `${selected.icon} ${selected.label}` : selected.label) : (placeholder ?? "—")}</span>
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
              {o.icon ? `${o.icon} ` : ""}{o.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Context menu (3-dot) ──────────────────────────────────────────────────────

export function ContextMenu({ onEdit, onRemove, onClose, lang }) {
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
        onTouchEnd={(e) => { e.preventDefault(); onEdit(); onClose(); }}
        onClick={() => { onEdit(); onClose(); }}
      >
        {t(lang, "pruneEdit")}
      </button>
      <button
        type="button"
        className="pruning-context-item pruning-context-item--danger"
        onTouchEnd={(e) => { e.preventDefault(); onRemove(); onClose(); }}
        onClick={() => { onRemove(); onClose(); }}
      >
        {t(lang, "pruneRemove")}
      </button>
    </div>
  );
}

// ── Plant row ─────────────────────────────────────────────────────────────────

export function PlantRow({ plant, onTap, onEdit, onRemove, lang, isSH = false }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const status = getPruningStatus(plant.pruningMonths, isSH);

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
        <MonthBlocks pruningMonths={plant.pruningMonths} isSH={isSH} />
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

export function PlantDetailPopup({ plant, onClose, lang, isSH = false, seasonLabel = null }) {
  const [description, setDescription] = useState(plant.description ?? null);

  useEffect(() => {
    setDescription(plant.description ?? null);
    if (!plant.perenualId || lang === "en") return;
    const controller = new AbortController();
    getPlantDetails(plant.perenualId, controller.signal, lang)
      .then((details) => { if (details.description) setDescription(details.description); })
      .catch(() => {});
    return () => controller.abort();
  }, [plant.perenualId, lang]);

  const adaptedMonths = adaptPruningMonths(plant.pruningMonths, isSH);
  const pruningText = adaptedMonths?.length
    ? adaptedMonths.join(", ")
    : t(lang, "pruneNoData");

  const lightOptions = [
    { value: "sun",        label: t(lang, "lightFullSun") },
    { value: "half-shade", label: t(lang, "lightHalfShade") },
    { value: "shade",      label: t(lang, "lightShade") },
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
            <span className="pruning-detail-label">{seasonLabel ?? t(lang, "pruneWindowLabel")}</span>
            <MonthBlocks pruningMonths={plant.pruningMonths} large isSH={isSH} />
            <span className="pruning-detail-months">{pruningText}</span>
          </div>

          <div className="pruning-detail-grid">
            {plant.cycle && (
              <div className="pruning-detail-cell">
                <span className="pruning-detail-cell-label">{t(lang, "pruneCycle")}</span>
                <span className="pruning-detail-cell-value">{translatePlantValue(lang, "cycle", plant.cycle)}</span>
              </div>
            )}
            {plant.maintenance && (
              <div className="pruning-detail-cell">
                <span className="pruning-detail-cell-label">{t(lang, "pruneMaintenance")}</span>
                <span className="pruning-detail-cell-value">{translatePlantValue(lang, "maintenance", plant.maintenance)}</span>
              </div>
            )}
            {plant.sunlight?.length > 0 && (
              <div className="pruning-detail-cell pruning-detail-cell--wide">
                <span className="pruning-detail-cell-label">{t(lang, "pruneSunlight")}</span>
                <span className="pruning-detail-cell-value">{plant.sunlight.map(s => translatePlantValue(lang, "sunlight", s)).join(", ")}</span>
              </div>
            )}
            {plant.lightCondition && (
              <div className="pruning-detail-cell">
                <span className="pruning-detail-cell-label">{t(lang, "pruneYourSetting")}</span>
                <span className="pruning-detail-cell-value">
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

          {description && (
            <p className="pruning-detail-description">{description}</p>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Add / Edit plant popup ────────────────────────────────────────────────────

export function AddPlantPopup({ initialPlant, onSave, onClose, lang, isSH = false, seasonLabel = null }) {
  const isEditing = !!initialPlant;

  const lightOptions = [
    { value: "sun",        label: t(lang, "lightFullSun") },
    { value: "half-shade", label: t(lang, "lightHalfShade") },
    { value: "shade",      label: t(lang, "lightShade") },
  ];
  const locationOptions = [
    { value: "ground", label: t(lang, "locationInGround") },
    { value: "pot",    label: t(lang, "locationInPot") },
  ];
  const categoryOptions = [
    { value: "vegetable", label: t(lang, "catVegetable"), icon: "🥕" },
    { value: "border",    label: t(lang, "catBorder"),    icon: "🌸" },
    { value: "drought",   label: t(lang, "catDrought"),   icon: "🌵" },
    { value: "trees",     label: t(lang, "catTrees"),     icon: "🌳" },
    { value: "pots",      label: t(lang, "catPots"),      icon: "🪴" },
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
  const [waterCategory, setWaterCategory] = useState(
    isEditing ? (initialPlant.waterCategory ?? detectWaterCategory(initialPlant)) : null
  );

  const [recognizing, setRecognizing] = useState(false);
  const [recognitionMatches, setRecognitionMatches] = useState(null); // null = not yet run
  const [recognitionError, setRecognitionError] = useState(null);
  const [enriching, setEnriching] = useState(false);

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
      return;
    }
    // Plant not in DB — enrich on the spot via Claude Haiku + Wikidata
    setEnriching(true);
    try {
      const newId = await enrichPlant(match.scientificName, match.commonName, abortRef.current?.signal);
      await handleSelectResult({ id: newId });
    } catch {
      setRecognitionError(t(lang, "pruneEnrichError"));
      setQuery(match.scientificName);
    } finally {
      setEnriching(false);
    }
  }

  // Auto-update waterCategory when inPot or selected species changes (only when adding).
  useEffect(() => {
    if (isEditing) return;
    if (!selectedSpecies && !inPot) {
      setWaterCategory(null);
      return;
    }
    setWaterCategory(detectWaterCategory({ ...(selectedSpecies ?? {}), inPot }));
  }, [inPot, selectedSpecies, isEditing]);

  function handleInPotChange(v) {
    const newInPot = v === "pot";
    setInPot(newInPot);
    // Immediately sync category: pot toggle overrides everything else.
    if (newInPot) {
      setWaterCategory("pots");
    } else if (waterCategory === "pots") {
      setWaterCategory(detectWaterCategory({ ...(selectedSpecies ?? {}), inPot: false }));
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
      waterCategory,
    });
  }

  const canSave = !!selectedSpecies && !loadingDetails && !!waterCategory;

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
            onChange={(e) => {
              const file = e.target.files?.[0];
              // Reset value immediately so the same file (or a new capture)
              // always triggers onChange on Android WebView — without this,
              // subsequent taps on the camera button silently do nothing.
              e.target.value = "";
              handleCameraCapture(file);
            }}
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

          {/* Enriching spinner (plant recognized but not yet in DB) */}
          {enriching && (
            <div className="pruning-loading-details">
              <div className="pruning-spinner" />
              <span>{t(lang, "pruneEnriching")}</span>
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
              {(() => {
                const maxScore = Math.max(...results.map((r) => r.popularity_nl ?? 0));
                let badgeGiven = false;
                return results.map((item) => {
                  const showBadge = results.length > 1 && !badgeGiven && (item.popularity_nl ?? 0) === maxScore;
                  if (showBadge) badgeGiven = true;
                  return (
                <button
                  key={item.id}
                  type="button"
                  className="pruning-search-result-item"
                  onClick={() => handleSelectResult(item)}
                >
                  <div className="pruning-result-row">
                    <span className="pruning-result-name">{item.common_name}</span>
                    {showBadge && <span className="pruning-result-popular">{t(lang, "pruneMostCommon")}</span>}
                  </div>
                  <span className="pruning-result-sci">
                    {Array.isArray(item.scientific_name)
                      ? item.scientific_name[0]
                      : item.scientific_name}
                  </span>
                </button>
                  );
                });
              })()}
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
                    <span className="pruning-selected-prune-label">{seasonLabel ?? t(lang, "pruneWindowLabel")}</span>
                    <MonthBlocks pruningMonths={selectedSpecies.pruningMonths} isSH={isSH} />
                    <span className="pruning-selected-prune-months">
                      {adaptPruningMonths(selectedSpecies.pruningMonths, isSH).join(", ")}
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
                onChange={handleInPotChange}
                options={locationOptions}
              />
            </div>
            <div className="pruning-dropdown-group pruning-dropdown-group--full">
              <label className="pruning-dropdown-label">{t(lang, "catWateringCategory")}</label>
              <CustomSelect
                value={waterCategory}
                onChange={setWaterCategory}
                options={categoryOptions}
                placeholder={t(lang, "catSelectPlaceholder")}
                openUp
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

export function PruningScreen({ onSyncPlants, lang = "en", latitude = null }) {
  const isSH = typeof latitude === "number" && latitude < 0;
  const [plants, setPlants] = useState(() => sortPlants(loadGardenPlants()));
  const [detailPlant, setDetailPlant] = useState(null);
  const [addPopupOpen, setAddPopupOpen] = useState(false);
  const [editingPlant, setEditingPlant] = useState(null);
  const [infoOpen, setInfoOpen] = useState(false);

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
      return sortPlants(updated, isSH);
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
        <div className="pruning-hero-top-row">
          <button
            type="button"
            className="pruning-info-btn"
            onClick={() => setInfoOpen(true)}
            aria-label="More info"
          >
            ⓘ
          </button>
        </div>
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
                isSH={isSH}
              />
            ))}
          </div>
        )}
      </div>

      {/* FAB — portalled to body so it's not clipped by the overflow-y:auto scroll container */}
      {createPortal(
        <button
          type="button"
          className="pruning-fab"
          onClick={() => { setEditingPlant(null); setAddPopupOpen(true); }}
          aria-label={t(lang, "pruneAddAriaLabel")}
        >
          +
        </button>,
        document.body
      )}

      {/* Detail popup */}
      {detailPlant && (
        <PlantDetailPopup plant={detailPlant} onClose={() => setDetailPlant(null)} lang={lang} isSH={isSH} />
      )}

      {/* Add / Edit popup */}
      {addPopupOpen && (
        <AddPlantPopup
          initialPlant={editingPlant}
          onSave={handleSavePlant}
          onClose={() => { setAddPopupOpen(false); setEditingPlant(null); }}
          lang={lang}
          isSH={isSH}
        />
      )}

      {/* Info sheet */}
      {infoOpen && (
        <div className="pruning-overlay" onClick={() => setInfoOpen(false)}>
          <div className="pruning-info-sheet" onClick={(e) => e.stopPropagation()}>
            <button type="button" className="pruning-sheet-close" onClick={() => setInfoOpen(false)}>✕</button>
            <h3 className="pruning-info-sheet-title">{t(lang, "pruneInfoTitle")}</h3>
            <p className="pruning-info-sheet-body">{t(lang, "pruneInfoBody")}</p>
          </div>
        </div>
      )}
    </div>
  );
}
