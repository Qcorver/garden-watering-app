import React, { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { searchPlants, getPlantDetails, enrichPlant } from "../api/perenualClient";
import { compressImage, identifyPlant } from "../api/plantIdentifyClient";
import {
  PlantThumbnail, PlantDetailPopup, MonthBlocks,
  monthsUntilNextPruning, adaptPruningMonths, MONTH_NAMES_EN,
  detectWaterCategory,
} from "./PruningScreen";
import { t } from "../i18n";
import "./PruningScreen.css";
import "./WishlistScreen.css";

// ── Planting month approximation ──────────────────────────────────────────────
// Derived from cycle since plant_species has no planting_months column.
// Northern Hemisphere values; isSH callers use adaptPruningMonths to shift by 6.

const PLANTING_MONTHS_BY_CYCLE = {
  annual:                 ["March", "April", "May"],
  biennial:               ["June", "July"],
  perennial:              ["March", "April", "September", "October"],
  "herbaceous perennial": ["March", "April", "September", "October"],
  bulb:                   ["September", "October", "November"],
  evergreen:              ["October", "November"],
  deciduous:              ["October", "November"],
  shrub:                  ["October", "November"],
  vine:                   ["April", "May"],
};

export function getPlantingMonths(cycle) {
  if (!cycle) return ["March", "April", "May"];
  return PLANTING_MONTHS_BY_CYCLE[cycle.toLowerCase()] ?? ["March", "April", "May"];
}

function getPlantingStatus(plantingMonths, isSH = false) {
  if (!plantingMonths?.length) return null;
  const adapted = adaptPruningMonths(plantingMonths, isSH);
  const cur = new Date().getMonth();
  const indices = adapted.map((m) => MONTH_NAMES_EN.indexOf(m)).filter((i) => i >= 0);
  if (indices.includes(cur)) return "now";
  if (indices.includes((cur + 1) % 12)) return "soon";
  return null;
}

function sortWishlistPlants(plants, isSH = false) {
  const currentMonth = new Date().getMonth();
  return [...plants].sort((a, b) => {
    const da = monthsUntilNextPruning(adaptPruningMonths(a.plantingMonths ?? [], isSH), currentMonth);
    const db = monthsUntilNextPruning(adaptPruningMonths(b.plantingMonths ?? [], isSH), currentMonth);
    return da - db;
  });
}

// ── localStorage helpers ──────────────────────────────────────────────────────

function loadWishlistPlants() {
  try {
    const raw = localStorage.getItem("wishlistPlants");
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function saveWishlistPlants(plants) {
  try { localStorage.setItem("wishlistPlants", JSON.stringify(plants)); }
  catch { /* ignore */ }
}

function loadGardenPlants() {
  try { return JSON.parse(localStorage.getItem("gardenPlants") ?? "[]") || []; }
  catch { return []; }
}

function saveGardenPlants(plants) {
  try { localStorage.setItem("gardenPlants", JSON.stringify(plants)); }
  catch { /* ignore */ }
}

function deduplicateBySpecies(plants, max = 3) {
  const seen = new Set();
  const out = [];
  for (const plant of plants) {
    const sciName = Array.isArray(plant.scientific_name)
      ? plant.scientific_name[0]
      : plant.scientific_name ?? "";
    const key = sciName.split(" ").slice(0, 2).join(" ").toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(plant);
    if (out.length >= max) break;
  }
  return out;
}

// ── Legend ────────────────────────────────────────────────────────────────────

function WishlistLegend({ lang }) {
  return (
    <div className="wishlist-legend">
      <div className="wishlist-legend-item">
        <div className="wishlist-legend-swatch wishlist-legend-swatch--active" />
        <span>{t(lang, "wishlistLegendActive")}</span>
      </div>
      <div className="wishlist-legend-item">
        <div className="wishlist-legend-swatch wishlist-legend-swatch--current" />
        <span>{t(lang, "wishlistLegendCurrent")}</span>
      </div>
    </div>
  );
}

// ── Wishlist plant row ────────────────────────────────────────────────────────

function WishlistContextMenu({ onRemove, onClose, lang }) {
  const ref = useRef(null);

  useEffect(() => {
    function handle(e) {
      if (ref.current && !ref.current.contains(e.target)) onClose();
    }
    document.addEventListener("mousedown", handle);
    document.addEventListener("touchstart", handle);
    return () => {
      document.removeEventListener("mousedown", handle);
      document.removeEventListener("touchstart", handle);
    };
  }, [onClose]);

  return (
    <div className="pruning-context-menu" ref={ref}>
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

function WishlistPlantRow({ plant, onTap, onRemove, lang, isSH = false }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const status = getPlantingStatus(plant.plantingMonths, isSH);

  return (
    <div className="pruning-plant-row" onClick={() => !menuOpen && onTap(plant)}>
      <PlantThumbnail imageUrl={plant.imageUrl} commonName={plant.commonName} />
      <div className="pruning-plant-info">
        <div className="pruning-plant-name-row">
          <span className="pruning-plant-name">{plant.commonName}</span>
          {status === "now" && (
            <span className="pruning-status-badge pruning-status-badge--now">{t(lang, "wishlistPlantNow")}</span>
          )}
          {status === "soon" && (
            <span className="pruning-status-badge pruning-status-badge--soon">{t(lang, "wishlistPlantSoon")}</span>
          )}
        </div>
        <span className="pruning-plant-scientific">{plant.scientificName}</span>
        <MonthBlocks pruningMonths={plant.plantingMonths ?? []} isSH={isSH} />
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
          <WishlistContextMenu
            onRemove={() => onRemove(plant.id)}
            onClose={() => setMenuOpen(false)}
            lang={lang}
          />
        )}
      </div>
    </div>
  );
}

// ── Add to wishlist popup ─────────────────────────────────────────────────────

function AddWishlistPlantPopup({ onSave, onClose, lang }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [selectedSpecies, setSelectedSpecies] = useState(null);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [recognizing, setRecognizing] = useState(false);
  const [recognitionMatches, setRecognitionMatches] = useState(null);
  const [recognitionError, setRecognitionError] = useState(null);
  const [enriching, setEnriching] = useState(false);

  const debounceRef = useRef(null);
  const abortRef = useRef(null);
  const cameraInputRef = useRef(null);

  useEffect(() => {
    if (selectedSpecies) return;
    clearTimeout(debounceRef.current);
    if (query.trim().length < 2) { setResults([]); return; }

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
        plantingMonthsFromDB: details.planting_months ?? [],
        imageUrl: details.default_image?.medium_url ?? details.default_image?.thumbnail ?? null,
        sunlight: details.sunlight ?? [],
        cycle: details.cycle ?? null,
        maintenance: details.maintenance ?? null,
        description: details.description ?? null,
      });
      setQuery(details.common_name ?? item.common_name);
    } catch (e) {
      if (e.name !== "AbortError") {
        setSelectedSpecies({
          id: item.id,
          commonName: item.common_name,
          scientificName: Array.isArray(item.scientific_name)
            ? item.scientific_name[0]
            : item.scientific_name ?? "",
          pruningMonths: [],
          plantingMonthsFromDB: [],
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
      if (e.name !== "AbortError") setRecognitionError(t(lang, "pruneRecognitionError"));
    } finally {
      setRecognizing(false);
    }
  }

  async function handleSelectRecognitionMatch(match) {
    setRecognitionMatches(null);
    if (match.dbId) { await handleSelectResult({ id: match.dbId }); return; }
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

  function handleSave() {
    if (!selectedSpecies) return;
    const plantingMonths = selectedSpecies.plantingMonthsFromDB?.length
      ? selectedSpecies.plantingMonthsFromDB
      : getPlantingMonths(selectedSpecies.cycle);
    onSave({
      id: crypto.randomUUID(),
      perenualId: selectedSpecies.id,
      commonName: selectedSpecies.commonName,
      scientificName: selectedSpecies.scientificName,
      pruningMonths: selectedSpecies.pruningMonths,
      plantingMonths,
      imageUrl: selectedSpecies.imageUrl,
      sunlight: selectedSpecies.sunlight,
      cycle: selectedSpecies.cycle,
      maintenance: selectedSpecies.maintenance,
      description: selectedSpecies.description,
      addedAt: new Date().toISOString(),
    });
  }

  const canSave = !!selectedSpecies && !loadingDetails;
  const plantingMonthsPreview = selectedSpecies
    ? (selectedSpecies.plantingMonthsFromDB?.length
        ? selectedSpecies.plantingMonthsFromDB
        : getPlantingMonths(selectedSpecies.cycle))
    : null;

  return (
    <div className="pruning-overlay" onClick={onClose}>
      <div className="pruning-add-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="pruning-add-header">
          <h3 className="pruning-add-title">{t(lang, "wishlistAddTitle")}</h3>
          <button type="button" className="pruning-sheet-close" onClick={onClose}>✕</button>
        </div>

        <div className="pruning-add-body">
          <input
            ref={cameraInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            style={{ display: "none" }}
            onChange={(e) => {
              const file = e.target.files?.[0];
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
              autoFocus
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck={false}
            />
            {selectedSpecies ? (
              <button type="button" className="pruning-search-clear" onClick={handleClearSelection}>✕</button>
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

          {recognizing && (
            <div className="pruning-loading-details">
              <div className="pruning-spinner" />
              <span>{t(lang, "pruneRecognizing")}</span>
            </div>
          )}
          {enriching && (
            <div className="pruning-loading-details">
              <div className="pruning-spinner" />
              <span>{t(lang, "pruneEnriching")}</span>
            </div>
          )}
          {recognitionError && (
            <div className="pruning-recognition-error">{recognitionError}</div>
          )}

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
                  <PlantThumbnail imageUrl={match.imageUrl ?? null} commonName={match.commonName ?? match.scientificName} />
                  <div className="pruning-result-text">
                    <div className="pruning-result-row">
                      <span className="pruning-result-name">{match.commonName ?? match.scientificName}</span>
                      <span className="pruning-confidence-badge">{match.score}%</span>
                      {!match.dbId && (
                        <span className="pruning-recognition-not-in-db">{t(lang, "pruneRecognitionNotInDb")}</span>
                      )}
                    </div>
                    <span className="pruning-result-sci">{match.scientificName}</span>
                  </div>
                </button>
              ))}
            </div>
          )}

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
                      <PlantThumbnail imageUrl={item.default_image?.thumbnail ?? item.image_url} commonName={item.common_name} />
                      <div className="pruning-result-text">
                        <div className="pruning-result-row">
                          <span className="pruning-result-name">{item.common_name}</span>
                          {showBadge && <span className="pruning-result-popular">{t(lang, "pruneMostCommon")}</span>}
                        </div>
                        <span className="pruning-result-sci">
                          {Array.isArray(item.scientific_name) ? item.scientific_name[0] : item.scientific_name}
                        </span>
                      </div>
                    </button>
                  );
                });
              })()}
            </div>
          )}

          {searching && results.length === 0 && !selectedSpecies && (
            <div className="pruning-search-spinner">{t(lang, "pruneSearching")}</div>
          )}
          {loadingDetails && (
            <div className="pruning-loading-details">
              <div className="pruning-spinner" />
              <span>{t(lang, "pruneLoadingDetails")}</span>
            </div>
          )}

          {selectedSpecies && !loadingDetails && (
            <div className="pruning-selected-card">
              <div className="pruning-selected-image-wrap">
                <PlantThumbnail imageUrl={selectedSpecies.imageUrl} commonName={selectedSpecies.commonName} />
              </div>
              <div className="pruning-selected-info">
                <span className="pruning-selected-name">{selectedSpecies.commonName}</span>
                <span className="pruning-selected-sci">{selectedSpecies.scientificName}</span>
                <span className="pruning-selected-prune-label">{t(lang, "wishlistPlantingWindow")}</span>
                <MonthBlocks pruningMonths={plantingMonthsPreview} />
                <span className="pruning-selected-prune-months">
                  {plantingMonthsPreview?.join(", ")}
                </span>
              </div>
            </div>
          )}
        </div>

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

export function WishlistScreen({ lang = "en", latitude = null, onClose = null, onSyncPlants = null, onAddToGarden = null }) {
  const isSH = typeof latitude === "number" && latitude < 0;
  const [plants, setPlants] = useState(() => sortWishlistPlants(loadWishlistPlants(), isSH));
  const [detailPlant, setDetailPlant] = useState(null);
  const [addPopupOpen, setAddPopupOpen] = useState(false);
  const [infoOpen, setInfoOpen] = useState(false);

  useEffect(() => {
    saveWishlistPlants(plants);
    onSyncPlants?.(plants);
  }, [plants]);

  function handleSavePlant(plantData) {
    setPlants((prev) => sortWishlistPlants([...prev, plantData], isSH));
    setAddPopupOpen(false);
  }

  function handleRemovePlant(id) {
    setPlants((prev) => prev.filter((p) => p.id !== id));
  }

  function handlePlanted(wishlistPlant, { lightCondition, inPot }) {
    const newGardenPlant = {
      id: crypto.randomUUID(),
      perenualId: wishlistPlant.perenualId,
      commonName: wishlistPlant.commonName,
      scientificName: wishlistPlant.scientificName,
      pruningMonths: wishlistPlant.pruningMonths ?? [],
      imageUrl: wishlistPlant.imageUrl ?? null,
      sunlight: wishlistPlant.sunlight ?? [],
      cycle: wishlistPlant.cycle ?? null,
      maintenance: wishlistPlant.maintenance ?? null,
      description: wishlistPlant.description ?? null,
      lightCondition,
      inPot,
      waterCategory: detectWaterCategory({ ...wishlistPlant, inPot }),
    };
    const updated = [...loadGardenPlants(), newGardenPlant];
    saveGardenPlants(updated);
    onAddToGarden?.(updated);
    setPlants((prev) => prev.filter((p) => p.id !== wishlistPlant.id));
    setDetailPlant(null);
  }

  const heroLines = t(lang, "wishlistHeroHeading").split("\n");
  const countLabel = t(lang, plants.length === 1 ? "wishlistCountSingular" : "wishlistCount", { n: plants.length });

  return (
    <div className="pruning-screen">
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
          {onClose && (
            <button
              type="button"
              className="pruning-info-btn"
              onClick={onClose}
              aria-label={t(lang, "gardenClose")}
            >
              ✕
            </button>
          )}
        </div>
        <div className="pruning-hero-title-row">
          <div>
            <h1 className="pruning-hero-heading">
              {heroLines.map((line, i) => (
                <React.Fragment key={i}>{line}{i === 0 && <br />}</React.Fragment>
              ))}
            </h1>
          </div>
          <div className="pruning-hero-month-badge">
            <span className="pruning-hero-emoji">🌱</span>
            <span className="pruning-hero-month">{countLabel}</span>
          </div>
        </div>
      </header>

      <div className="pruning-content">
        {plants.length === 0 ? (
          <div className="pruning-empty">
            <div className="pruning-empty-icon">🌱</div>
            <p className="pruning-empty-title">{t(lang, "wishlistEmptyTitle")}</p>
            <p className="pruning-empty-sub">{t(lang, "wishlistEmptySub")}</p>
          </div>
        ) : (
          <>
            <WishlistLegend lang={lang} />
            <div className="pruning-plant-list">
              {plants.map((plant) => (
                <WishlistPlantRow
                  key={plant.id}
                  plant={plant}
                  onTap={setDetailPlant}
                  onRemove={handleRemovePlant}
                  lang={lang}
                  isSH={isSH}
                />
              ))}
            </div>
          </>
        )}
      </div>

      {!addPopupOpen && !detailPlant && createPortal(
        <button
          type="button"
          className="pruning-fab"
          onClick={() => setAddPopupOpen(true)}
          aria-label={t(lang, "wishlistAddAriaLabel")}
        >
          +
        </button>,
        document.body
      )}

      {/* Show plant detail with planting months instead of pruning months */}
      {detailPlant && (
        <PlantDetailPopup
          plant={{ ...detailPlant, pruningMonths: detailPlant.plantingMonths ?? [] }}
          onClose={() => setDetailPlant(null)}
          lang={lang}
          isSH={isSH}
          seasonLabel={t(lang, "wishlistPlantingWindow")}
          onPlanted={(opts) => handlePlanted(detailPlant, opts)}
        />
      )}

      {addPopupOpen && (
        <AddWishlistPlantPopup
          onSave={handleSavePlant}
          onClose={() => setAddPopupOpen(false)}
          lang={lang}
        />
      )}

      {infoOpen && (
        <div className="pruning-overlay" onClick={() => setInfoOpen(false)}>
          <div className="pruning-info-sheet" onClick={(e) => e.stopPropagation()}>
            <button type="button" className="pruning-sheet-close" onClick={() => setInfoOpen(false)}>✕</button>
            <h3 className="pruning-info-sheet-title">{t(lang, "wishlistInfoTitle")}</h3>
            <p className="pruning-info-sheet-body">{t(lang, "wishlistInfoBody")}</p>
          </div>
        </div>
      )}
    </div>
  );
}
