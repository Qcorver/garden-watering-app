import React, { useState, useEffect, useMemo, useRef } from "react";
import { createPortal } from "react-dom";
import { format, parseISO } from "date-fns";
import { supabase } from "../supabaseClient";
import {
  MonthBlocks, MONTH_NAMES_EN, adaptPruningMonths, CustomSelect,
} from "./PruningScreen";
import { t, getDateLocale } from "../i18n";
import { compressImage, identifyPlant } from "../api/plantIdentifyClient";
import "./PruningScreen.css";
import "./MoestuinScreen.css";

// ── localStorage helpers ──────────────────────────────────────────────────────

function loadMoestuinPlants() {
  try { return JSON.parse(localStorage.getItem("moestuinPlants") ?? "[]") || []; }
  catch { return []; }
}

function saveMoestuinPlants(plants) {
  try { localStorage.setItem("moestuinPlants", JSON.stringify(plants)); }
  catch { /* ignore */ }
}

// Crop catalogue cache so the screen works offline after first load
function loadCropCache() {
  try { return JSON.parse(localStorage.getItem("cropSpeciesCache") ?? "[]") || []; }
  catch { return []; }
}

function saveCropCache(crops) {
  try { localStorage.setItem("cropSpeciesCache", JSON.stringify(crops)); }
  catch { /* ignore */ }
}

// ── Growth stage model ────────────────────────────────────────────────────────
// A plant moves through a stage path determined by how it was started.
// Stage dates live in sownOn / germinatedOn / plantedOutOn / firstHarvestOn.

const STAGE_DATE_FIELD = {
  sown: "sownOn",
  germinated: "germinatedOn",
  planted_out: "plantedOutOn",
  harvest: "firstHarvestOn",
};

export function stagePath(plant) {
  if (plant.startedAs === "planted") return ["planted_out", "harvest"];
  if (plant.startedAs === "sown_indoor") return ["sown", "germinated", "planted_out", "harvest"];
  return ["sown", "germinated", "harvest"];
}

export function currentStage(plant) {
  const path = stagePath(plant);
  let cur = null;
  for (const stage of path) {
    if (plant[STAGE_DATE_FIELD[stage]]) cur = stage;
  }
  return cur;
}

export function nextStage(plant) {
  const path = stagePath(plant);
  for (const stage of path) {
    if (!plant[STAGE_DATE_FIELD[stage]]) return stage;
  }
  return null;
}

function daysSince(dateStr) {
  if (!dateStr) return null;
  const then = parseISO(dateStr);
  return Math.floor((Date.now() - then.getTime()) / 86400000);
}

// Which check-in question is due, if any — mirrors the push-daily logic
export function checkDue(plant) {
  const next = nextStage(plant);
  const sinceSown = daysSince(plant.sownOn);
  if (next === "germinated" && sinceSown != null && plant.germMin != null && sinceSown >= plant.germMin) {
    return "germinated";
  }
  if (next === "harvest" && sinceSown != null && plant.harvMin != null && sinceSown >= plant.harvMin) {
    return "harvest";
  }
  return null;
}

const STAGE_LABEL_KEY = {
  sown: "moestuinStageSown",
  germinated: "moestuinStageGerminated",
  planted_out: "moestuinStagePlantedOut",
  harvest: "moestuinStageHarvest",
};

const ADVANCE_LABEL_KEY = {
  germinated: "moestuinAdvanceGerminated",
  planted_out: "moestuinAdvancePlantedOut",
  harvest: "moestuinAdvanceHarvest",
};

function cropDisplayName(cropLike, lang) {
  return lang === "nl" ? cropLike.nameNl ?? cropLike.name_nl : (cropLike.nameEn ?? cropLike.name_en ?? cropLike.nameNl ?? cropLike.name_nl);
}

function daysAgoLabel(dateStr, lang) {
  const n = daysSince(dateStr);
  if (n == null) return "";
  if (n === 0) return t(lang, "moestuinToday");
  if (n === 1) return t(lang, "moestuinDaySince");
  return t(lang, "moestuinDaysSince", { n });
}

function sortMoestuinPlants(plants) {
  return [...plants].sort((a, b) => {
    const ca = checkDue(a) ? 1 : 0;
    const cb = checkDue(b) ? 1 : 0;
    if (ca !== cb) return cb - ca;
    return (b.addedAt ?? "").localeCompare(a.addedAt ?? "");
  });
}

// ── Context menu (remove only) ────────────────────────────────────────────────

function MoestuinContextMenu({ onRemove, onClose, lang }) {
  const ref = React.useRef(null);

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

// ── Plant row ─────────────────────────────────────────────────────────────────

function MoestuinPlantRow({ plant, onTap, onRemove, lang, isSH = false }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const cur = currentStage(plant);
  const due = checkDue(plant);
  const stageDate = cur ? plant[STAGE_DATE_FIELD[cur]] : null;

  return (
    <div className="pruning-plant-row" onClick={() => !menuOpen && onTap(plant)}>
      <div className="pruning-plant-thumb moestuin-emoji-thumb">{plant.emoji ?? "🌱"}</div>

      <div className="pruning-plant-info">
        <div className="pruning-plant-name-row">
          <span className="pruning-plant-name">{cropDisplayName(plant, lang)}</span>
          {due === "germinated" && (
            <span className="pruning-status-badge pruning-status-badge--soon">{t(lang, "moestuinCheckGerminated")}</span>
          )}
          {due === "harvest" && (
            <span className="pruning-status-badge pruning-status-badge--now">{t(lang, "moestuinCheckHarvest")}</span>
          )}
        </div>
        {cur && (
          <span className="moestuin-stage-line">
            {t(lang, STAGE_LABEL_KEY[cur])} · {daysAgoLabel(stageDate, lang)}
          </span>
        )}
        <MonthBlocks pruningMonths={plant.harvestMonths ?? []} isSH={isSH} />
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
          <MoestuinContextMenu
            onRemove={() => onRemove(plant.id)}
            onClose={() => setMenuOpen(false)}
            lang={lang}
          />
        )}
      </div>
    </div>
  );
}

// ── Sow-this-month card ───────────────────────────────────────────────────────

function SowNowCard({ crops, onPickCrop, lang, isSH = false }) {
  const currentMonthName = MONTH_NAMES_EN[new Date().getMonth()];

  const inWindow = (months) =>
    adaptPruningMonths(months ?? [], isSH).includes(currentMonthName);

  const outdoor = crops.filter((c) => inWindow(c.sow_outdoor_months));
  const indoor = crops.filter(
    (c) => inWindow(c.sow_indoor_months) && !inWindow(c.sow_outdoor_months)
  );

  if (outdoor.length === 0 && indoor.length === 0) return null;

  const renderChips = (list) =>
    list.map((c) => (
      <button
        key={c.id}
        type="button"
        className="moestuin-chip"
        onClick={() => onPickCrop(c)}
      >
        {c.emoji} {cropDisplayName(c, lang)}
      </button>
    ));

  return (
    <div className="moestuin-sow-card">
      <span className="moestuin-sow-card-title">🌱 {t(lang, "moestuinSowNowTitle")}</span>
      {outdoor.length > 0 && (
        <>
          <span className="moestuin-sow-card-label">{t(lang, "moestuinSowOutdoorLabel")}</span>
          <div className="moestuin-chip-row">{renderChips(outdoor)}</div>
        </>
      )}
      {indoor.length > 0 && (
        <>
          <span className="moestuin-sow-card-label">{t(lang, "moestuinSowIndoorLabel")}</span>
          <div className="moestuin-chip-row">{renderChips(indoor)}</div>
        </>
      )}
    </div>
  );
}

// ── Detail popup (growth stages) ──────────────────────────────────────────────

function MoestuinDetailPopup({ plant, onClose, onUpdate, lang, isSH = false }) {
  const path = stagePath(plant);
  const next = nextStage(plant);
  const locale = getDateLocale(lang);

  // The stage set at creation can't be undone (removing it would leave an empty plant)
  const initialStage = path[0];
  const completedBeyondInitial = path.filter(
    (s) => s !== initialStage && plant[STAGE_DATE_FIELD[s]]
  );
  const lastCompleted = completedBeyondInitial[completedBeyondInitial.length - 1] ?? null;

  function handleAdvance() {
    if (!next) return;
    onUpdate({ ...plant, [STAGE_DATE_FIELD[next]]: format(new Date(), "yyyy-MM-dd") });
  }

  function handleUndo() {
    if (!lastCompleted) return;
    onUpdate({ ...plant, [STAGE_DATE_FIELD[lastCompleted]]: null });
  }

  return (
    <div className="pruning-overlay" onClick={onClose}>
      <div className="pruning-detail-sheet moestuin-detail-sheet" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="pruning-sheet-close" onClick={onClose}>✕</button>

        <div className="pruning-detail-body">
          <div className="moestuin-detail-header">
            <span className="moestuin-detail-emoji">{plant.emoji ?? "🌱"}</span>
            <div>
              <h2 className="pruning-detail-name">{cropDisplayName(plant, lang)}</h2>
              <p className="pruning-detail-scientific">{plant.scientificName}</p>
            </div>
          </div>

          {plant.sowOutdoorMonths?.length > 0 && (
            <div className="pruning-detail-section">
              <span className="pruning-detail-label">{t(lang, "moestuinSowWindow")}</span>
              <MonthBlocks pruningMonths={plant.sowOutdoorMonths} large isSH={isSH} />
            </div>
          )}

          {plant.harvestMonths?.length > 0 && (
            <div className="pruning-detail-section">
              <span className="pruning-detail-label">{t(lang, "moestuinHarvestWindow")}</span>
              <MonthBlocks pruningMonths={plant.harvestMonths} large isSH={isSH} />
            </div>
          )}

          <div className="pruning-detail-section">
            <span className="pruning-detail-label">{t(lang, "moestuinStagesLabel")}</span>
            <div className="moestuin-stage-list">
              {path.map((stage) => {
                const date = plant[STAGE_DATE_FIELD[stage]];
                return (
                  <div key={stage} className={`moestuin-stage-item${date ? " moestuin-stage-item--done" : ""}`}>
                    <span className="moestuin-stage-dot">{date ? "✓" : ""}</span>
                    <span className="moestuin-stage-name">{t(lang, STAGE_LABEL_KEY[stage])}</span>
                    <span className="moestuin-stage-date">
                      {date ? format(parseISO(date), "d MMM", { locale }) : "—"}
                    </span>
                  </div>
                );
              })}
            </div>

            {next === "germinated" && plant.germMin != null && plant.germMax != null && (
              <span className="moestuin-stage-hint">
                {t(lang, "moestuinGermHint", { min: plant.germMin, max: plant.germMax })}
              </span>
            )}
            {next === "harvest" && plant.startedAs !== "planted" && plant.harvMin != null && plant.harvMax != null && (
              <span className="moestuin-stage-hint">
                {t(lang, "moestuinHarvestHint", { min: plant.harvMin, max: plant.harvMax })}
              </span>
            )}
          </div>

          {next && (
            <button type="button" className="moestuin-advance-btn" onClick={handleAdvance}>
              {t(lang, ADVANCE_LABEL_KEY[next])}
            </button>
          )}
          {lastCompleted && (
            <button type="button" className="moestuin-undo-btn" onClick={handleUndo}>
              {t(lang, "moestuinUndo")}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Add crop popup ────────────────────────────────────────────────────────────

const CATEGORY_ORDER = ["groente", "kruid", "fruit"];
const CATEGORY_LABEL_KEY = {
  groente: "moestuinCatGroente",
  kruid: "moestuinCatKruid",
  fruit: "moestuinCatFruit",
};

function startOptions(crop, lang) {
  const opts = [];
  if (crop.sow_outdoor_months?.length) {
    opts.push({ value: "sown_outdoor", label: t(lang, "moestuinStartSownOutdoor") });
  }
  if (crop.sow_indoor_months?.length) {
    opts.push({ value: "sown_indoor", label: t(lang, "moestuinStartSownIndoor") });
  }
  // Buying a seedling is always possible
  opts.push({ value: "planted", label: t(lang, "moestuinStartPlanted") });
  return opts;
}

function AddCropPopup({ crops, preselected, onSave, onClose, lang, isSH = false }) {
  const [query, setQuery] = useState("");
  const [selectedCrop, setSelectedCrop] = useState(preselected ?? null);
  const [startedAs, setStartedAs] = useState(
    preselected ? startOptions(preselected, lang)[0].value : null
  );
  const [recognizing, setRecognizing] = useState(false);
  const [recognitionMatches, setRecognitionMatches] = useState(null);
  const [recognitionError, setRecognitionError] = useState(null);
  const cameraInputRef = useRef(null);
  const abortRef = useRef(null);

  async function handleCameraCapture(file) {
    if (!file) return;
    setRecognizing(true);
    setRecognitionMatches(null);
    setRecognitionError(null);
    setQuery("");

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const base64 = await compressImage(file);
      const matches = await identifyPlant(base64, controller.signal, lang);
      const mapped = matches.map((m) => {
        const sciLower = m.scientificName?.toLowerCase() ?? "";
        const crop =
          crops.find((c) => c.scientific_name?.toLowerCase() === sciLower) ??
          crops.find((c) => {
            const cGenus = c.scientific_name?.split(" ")[0]?.toLowerCase();
            const mGenus = sciLower.split(" ")[0];
            return cGenus && mGenus && cGenus === mGenus;
          });
        return { ...m, crop: crop ?? null };
      });
      setRecognitionMatches(mapped);
    } catch (e) {
      if (e.name !== "AbortError") setRecognitionError(t(lang, "pruneRecognitionError"));
    } finally {
      setRecognizing(false);
    }
  }

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q.length === 0) return crops;
    return crops.filter(
      (c) =>
        c.name_nl?.toLowerCase().includes(q) ||
        c.name_en?.toLowerCase().includes(q) ||
        c.scientific_name?.toLowerCase().includes(q)
    );
  }, [crops, query]);

  function handleSelect(crop) {
    setSelectedCrop(crop);
    setStartedAs(startOptions(crop, lang)[0].value);
  }

  function handleSave() {
    if (!selectedCrop || !startedAs) return;
    const today = format(new Date(), "yyyy-MM-dd");
    onSave({
      id: crypto.randomUUID(),
      cropId: selectedCrop.id,
      nameNl: selectedCrop.name_nl,
      nameEn: selectedCrop.name_en,
      scientificName: selectedCrop.scientific_name,
      emoji: selectedCrop.emoji,
      category: selectedCrop.category,
      sowIndoorMonths: selectedCrop.sow_indoor_months ?? [],
      sowOutdoorMonths: selectedCrop.sow_outdoor_months ?? [],
      plantOutMonths: selectedCrop.plant_out_months ?? [],
      harvestMonths: selectedCrop.harvest_months ?? [],
      germMin: selectedCrop.days_to_germinate_min,
      germMax: selectedCrop.days_to_germinate_max,
      harvMin: selectedCrop.days_to_harvest_min,
      harvMax: selectedCrop.days_to_harvest_max,
      startedAs,
      sownOn: startedAs === "planted" ? null : today,
      germinatedOn: null,
      plantedOutOn: startedAs === "planted" ? today : null,
      firstHarvestOn: null,
      addedAt: new Date().toISOString(),
    });
  }

  return (
    <div className="pruning-overlay" onClick={onClose}>
      <div className="pruning-add-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="pruning-add-header">
          <h3 className="pruning-add-title">{t(lang, "moestuinAddTitle")}</h3>
          <button type="button" className="pruning-sheet-close" onClick={onClose}>✕</button>
        </div>

        <div className="pruning-add-body">
          {!selectedCrop && (
            <>
              {/* Hidden file input for camera */}
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
                  placeholder={t(lang, "moestuinSearchPlaceholder")}
                  value={query}
                  onChange={(e) => { setQuery(e.target.value); setRecognitionMatches(null); }}
                  autoComplete="off"
                  autoCorrect="off"
                  autoCapitalize="off"
                  spellCheck={false}
                />
                <button
                  type="button"
                  className="pruning-camera-btn"
                  aria-label={t(lang, "pruneCameraAriaLabel")}
                  onClick={() => cameraInputRef.current?.click()}
                >
                  📷
                </button>
              </div>

              {recognizing && (
                <div className="pruning-loading-details">
                  <div className="pruning-spinner" />
                  <span>{t(lang, "pruneRecognizing")}</span>
                </div>
              )}

              {recognitionError && (
                <div className="pruning-recognition-error">{recognitionError}</div>
              )}

              {recognitionMatches && !recognizing && (
                <div className="pruning-search-results">
                  <div className="pruning-recognition-label">{t(lang, "pruneRecognitionResults")}</div>
                  {recognitionMatches.map((m) => (
                    m.crop ? (
                      <button
                        key={m.scientificName}
                        type="button"
                        className="pruning-search-result-item"
                        onClick={() => { handleSelect(m.crop); setRecognitionMatches(null); }}
                      >
                        <span className="moestuin-crop-item-emoji">{m.crop.emoji ?? "🌱"}</span>
                        <div className="pruning-result-text">
                          <div className="pruning-result-row">
                            <span className="pruning-result-name">{cropDisplayName(m.crop, lang)}</span>
                            {m.aiVerified && (
                              <span className="pruning-confidence-badge pruning-ai-pick-badge">
                                ✓ {t(lang, "pruneRecognitionAiPick")}
                              </span>
                            )}
                            {m.score != null && (
                              <span className="pruning-confidence-badge">{m.score}%</span>
                            )}
                          </div>
                          <span className="pruning-result-sci">{m.scientificName}</span>
                        </div>
                      </button>
                    ) : (
                      <div key={m.scientificName} className="pruning-search-result-item pruning-search-result-item--disabled">
                        <span className="moestuin-crop-item-emoji">🌿</span>
                        <div className="pruning-result-text">
                          <div className="pruning-result-row">
                            <span className="pruning-result-name">{m.commonName ?? m.scientificName}</span>
                            <span className="pruning-recognition-not-in-db">{t(lang, "moestuinRecognitionNotInCatalogue")}</span>
                          </div>
                          <span className="pruning-result-sci">{m.scientificName}</span>
                        </div>
                      </div>
                    )
                  ))}
                </div>
              )}

              <div className="moestuin-crop-list">
                {CATEGORY_ORDER.map((cat) => {
                  const inCat = filtered.filter((c) => c.category === cat);
                  if (inCat.length === 0) return null;
                  return (
                    <React.Fragment key={cat}>
                      <div className="moestuin-crop-cat-header">{t(lang, CATEGORY_LABEL_KEY[cat])}</div>
                      {inCat.map((crop) => (
                        <button
                          key={crop.id}
                          type="button"
                          className="moestuin-crop-item"
                          onClick={() => handleSelect(crop)}
                        >
                          <span className="moestuin-crop-item-emoji">{crop.emoji ?? "🌱"}</span>
                          <span className="moestuin-crop-item-name">{cropDisplayName(crop, lang)}</span>
                          <span className="moestuin-crop-item-sci">{crop.scientific_name}</span>
                        </button>
                      ))}
                    </React.Fragment>
                  );
                })}
              </div>
            </>
          )}

          {selectedCrop && (
            <>
              <div className="pruning-selected-card">
                <div className="pruning-selected-image-wrap moestuin-emoji-thumb moestuin-emoji-thumb--large">
                  {selectedCrop.emoji ?? "🌱"}
                </div>
                <div className="pruning-selected-info">
                  <span className="pruning-selected-name">{cropDisplayName(selectedCrop, lang)}</span>
                  <span className="pruning-selected-sci">{selectedCrop.scientific_name}</span>
                  {selectedCrop.sow_outdoor_months?.length > 0 && (
                    <>
                      <span className="pruning-selected-prune-label">{t(lang, "moestuinSowWindow")}</span>
                      <MonthBlocks pruningMonths={selectedCrop.sow_outdoor_months} isSH={isSH} />
                    </>
                  )}
                </div>
                <button
                  type="button"
                  className="pruning-search-clear moestuin-selected-clear"
                  onClick={() => { setSelectedCrop(null); setStartedAs(null); }}
                >
                  ✕
                </button>
              </div>

              <div className="pruning-dropdown-group pruning-dropdown-group--full">
                <label className="pruning-dropdown-label">{t(lang, "moestuinStartLabel")}</label>
                <CustomSelect
                  value={startedAs}
                  onChange={setStartedAs}
                  options={startOptions(selectedCrop, lang)}
                />
              </div>
            </>
          )}
        </div>

        <div className="pruning-add-footer">
          <button type="button" className="pruning-btn-cancel" onClick={onClose}>
            {t(lang, "pruneCancel")}
          </button>
          <button
            type="button"
            className={`pruning-btn-save${selectedCrop ? "" : " pruning-btn-save--disabled"}`}
            disabled={!selectedCrop}
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

export function MoestuinScreen({ lang = "en", latitude = null, onClose = null, onSyncPlants = null, initialDetailPlantId = null }) {
  const isSH = typeof latitude === "number" && latitude < 0;
  const [plants, setPlants] = useState(() => sortMoestuinPlants(loadMoestuinPlants()));
  const [crops, setCrops] = useState(() => loadCropCache());
  const [detailPlantId, setDetailPlantId] = useState(initialDetailPlantId);
  const [addPopupOpen, setAddPopupOpen] = useState(false);
  const [preselectedCrop, setPreselectedCrop] = useState(null);
  const [infoOpen, setInfoOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    supabase
      .from("crop_species")
      .select("*")
      .order("name_nl")
      .then(({ data, error }) => {
        if (cancelled || error || !data?.length) return;
        setCrops(data);
        saveCropCache(data);
      });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    saveMoestuinPlants(plants);
    onSyncPlants?.(plants);
  }, [plants, onSyncPlants]);

  const detailPlant = plants.find((p) => p.id === detailPlantId) ?? null;

  function handleSavePlant(plantData) {
    setPlants((prev) => sortMoestuinPlants([...prev, plantData]));
    setAddPopupOpen(false);
    setPreselectedCrop(null);
  }

  function handleUpdatePlant(updated) {
    setPlants((prev) => sortMoestuinPlants(prev.map((p) => (p.id === updated.id ? updated : p))));
  }

  function handleRemovePlant(id) {
    setPlants((prev) => prev.filter((p) => p.id !== id));
  }

  function handlePickCrop(crop) {
    setPreselectedCrop(crop);
    setAddPopupOpen(true);
  }

  const countLabel = t(lang, plants.length === 1 ? "moestuinCountSingular" : "moestuinCount", { n: plants.length });
  const heroLines = t(lang, "moestuinHeroHeading").split("\n");

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
                <React.Fragment key={i}>{line}{i === 0 && heroLines.length > 1 && <br />}</React.Fragment>
              ))}
            </h1>
          </div>
          <div className="pruning-hero-month-badge">
            <span className="pruning-hero-emoji">🥕</span>
            <span className="pruning-hero-month">{countLabel}</span>
          </div>
        </div>
      </header>

      <div className="pruning-content">
        <SowNowCard crops={crops} onPickCrop={handlePickCrop} lang={lang} isSH={isSH} />

        {plants.length === 0 ? (
          <div className="pruning-empty">
            <div className="pruning-empty-icon">🥕</div>
            <p className="pruning-empty-title">{t(lang, "moestuinEmptyTitle")}</p>
            <p className="pruning-empty-sub">{t(lang, "moestuinEmptySub")}</p>
          </div>
        ) : (
          <>
            <div className="pruning-legend">
              <div className="pruning-legend-item">
                <div className="pruning-legend-block pruning-legend-block--active" />
                <span className="pruning-legend-label">{t(lang, "moestuinLegendActive")}</span>
              </div>
              <div className="pruning-legend-item">
                <div className="pruning-legend-block pruning-legend-block--current" />
                <span className="pruning-legend-label">{t(lang, "moestuinLegendCurrent")}</span>
              </div>
            </div>
            <div className="pruning-plant-list">
              {plants.map((plant) => (
                <MoestuinPlantRow
                  key={plant.id}
                  plant={plant}
                  onTap={(p) => setDetailPlantId(p.id)}
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
          onClick={() => { setPreselectedCrop(null); setAddPopupOpen(true); }}
          aria-label={t(lang, "moestuinAddAriaLabel")}
        >
          +
        </button>,
        document.body
      )}

      {detailPlant && (
        <MoestuinDetailPopup
          plant={detailPlant}
          onClose={() => setDetailPlantId(null)}
          onUpdate={handleUpdatePlant}
          lang={lang}
          isSH={isSH}
        />
      )}

      {addPopupOpen && (
        <AddCropPopup
          crops={crops}
          preselected={preselectedCrop}
          onSave={handleSavePlant}
          onClose={() => { setAddPopupOpen(false); setPreselectedCrop(null); }}
          lang={lang}
          isSH={isSH}
        />
      )}

      {infoOpen && (
        <div className="pruning-overlay" onClick={() => setInfoOpen(false)}>
          <div className="pruning-info-sheet" onClick={(e) => e.stopPropagation()}>
            <button type="button" className="pruning-sheet-close" onClick={() => setInfoOpen(false)}>✕</button>
            <h3 className="pruning-info-sheet-title">{t(lang, "moestuinInfoTitle")}</h3>
            <p className="pruning-info-sheet-body">{t(lang, "moestuinInfoBody")}</p>
          </div>
        </div>
      )}
    </div>
  );
}
