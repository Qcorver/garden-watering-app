import React, { useState, useEffect } from "react";
import { t, strings } from "../i18n";
import {
  MONTH_NAMES_EN,
  adaptPruningMonths,
  sortPlants,
  MonthBlocks,
  PlantRow,
  PlantDetailPopup,
  AddPlantPopup,
} from "./PruningScreen";
import "./PruningScreen.css";

const HERBS_KEY = "herbsPlants";

function loadHerbs() {
  try {
    const raw = localStorage.getItem(HERBS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveHerbs(plants) {
  try {
    localStorage.setItem(HERBS_KEY, JSON.stringify(plants));
  } catch { /* ignore */ }
}

export function HerbsScreen({ lang = "en", latitude = null }) {
  const isSH = typeof latitude === "number" && latitude < 0;
  const [plants, setPlants] = useState(() => sortPlants(loadHerbs(), isSH));
  const [detailPlant, setDetailPlant] = useState(null);
  const [addPopupOpen, setAddPopupOpen] = useState(false);
  const [editingPlant, setEditingPlant] = useState(null);

  useEffect(() => {
    saveHerbs(plants);
  }, [plants]);

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

  const currentMonthName =
    strings[lang]?.monthNames[new Date().getMonth()] ??
    MONTH_NAMES_EN[new Date().getMonth()];

  const seasonLabel = t(lang, "herbHarvestLabel");

  return (
    <div className="pruning-screen">
      {/* Hero */}
      <header className="pruning-hero">
        <p className="pruning-hero-app-title">{t(lang, "pruneAppTitle")}</p>
        <div className="pruning-hero-title-row">
          <div>
            <h1 className="pruning-hero-heading" style={{ whiteSpace: "pre-line" }}>
              {t(lang, "herbHeroHeading")}
            </h1>
            <p className="pruning-hero-sub">{t(lang, "herbHeroSub")}</p>
          </div>
          <div className="pruning-hero-month-badge">
            <span className="pruning-hero-emoji">🌿</span>
            <span className="pruning-hero-month">{currentMonthName}</span>
          </div>
        </div>
      </header>

      {/* Plant list */}
      <div className="pruning-content">
        {plants.length === 0 ? (
          <div className="pruning-empty">
            <div className="pruning-empty-icon">🥬</div>
            <p className="pruning-empty-title">{t(lang, "herbEmptyTitle")}</p>
            <p className="pruning-empty-sub">{t(lang, "herbEmptySub")}</p>
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

      {/* FAB */}
      <button
        type="button"
        className="pruning-fab"
        onClick={() => { setEditingPlant(null); setAddPopupOpen(true); }}
        aria-label={t(lang, "herbAddAriaLabel")}
      >
        +
      </button>

      {/* Detail popup */}
      {detailPlant && (
        <PlantDetailPopup
          plant={detailPlant}
          onClose={() => setDetailPlant(null)}
          lang={lang}
          isSH={isSH}
          seasonLabel={seasonLabel}
        />
      )}

      {/* Add / Edit popup */}
      {addPopupOpen && (
        <AddPlantPopup
          initialPlant={editingPlant}
          onSave={handleSavePlant}
          onClose={() => { setAddPopupOpen(false); setEditingPlant(null); }}
          lang={lang}
          isSH={isSH}
          seasonLabel={seasonLabel}
        />
      )}
    </div>
  );
}
