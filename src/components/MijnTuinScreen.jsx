import React, { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { PruningScreen } from "./PruningScreen";
import { WishlistScreen } from "./WishlistScreen";
import { MoestuinScreen } from "./MoestuinScreen";
import { AssistantScreen } from "./AssistantScreen";
import { t } from "../i18n";
import { PREMIUM_GATING_ENABLED } from "../config";
import pruningShears from "../assets/pruning-shears.png";
import "./MijnTuinScreen.css";

// ── Tile ─────────────────────────────────────────────────────────────────────

function GardenTile({ icon, title, subtitle, onClick, isPremium, isComingSoon, comingSoonLabel }) {
  const showLock = isPremium && PREMIUM_GATING_ENABLED;
  return (
    <button
      className={`garden-tile${isComingSoon ? " garden-tile--coming-soon" : ""}`}
      onClick={isComingSoon ? undefined : onClick}
      disabled={isComingSoon}
      type="button"
    >
      {showLock && <span className="garden-tile-lock">★</span>}
      <span className="garden-tile-icon">{icon}</span>
      <span className="garden-tile-title">{title}</span>
      {subtitle && <span className="garden-tile-subtitle">{subtitle}</span>}
      {isComingSoon && <span className="garden-tile-coming-soon">{comingSoonLabel}</span>}
    </button>
  );
}

// ── Wishlist popup (bottom sheet modal) ──────────────────────────────────────

function WishlistPopup({ onClose, lang, latitude, onSyncPlants, onAddToGarden }) {
  return createPortal(
    <div className="garden-popup-overlay garden-popup-overlay--pruning" onClick={onClose}>
      <div className="garden-pruning-modal" onClick={(e) => e.stopPropagation()}>
        <div className="garden-pruning-scroll">
          <WishlistScreen lang={lang} latitude={latitude} onClose={onClose} onSyncPlants={onSyncPlants} onAddToGarden={onAddToGarden} />
        </div>
      </div>
    </div>,
    document.body
  );
}

// ── Moestuin popup (bottom sheet modal) ──────────────────────────────────────

function MoestuinPopup({ onClose, lang, latitude, onSyncPlants, initialDetailPlantId = null }) {
  return createPortal(
    <div className="garden-popup-overlay garden-popup-overlay--pruning" onClick={onClose}>
      <div className="garden-pruning-modal" onClick={(e) => e.stopPropagation()}>
        <div className="garden-pruning-scroll">
          <MoestuinScreen
            lang={lang}
            latitude={latitude}
            onClose={onClose}
            onSyncPlants={onSyncPlants}
            initialDetailPlantId={initialDetailPlantId}
          />
        </div>
      </div>
    </div>,
    document.body
  );
}

// ── Assistant popup (bottom sheet modal) ─────────────────────────────────────
// No .garden-pruning-scroll wrapper: the chat manages its own scrolling so the
// input row stays pinned at the bottom of the sheet.

function AssistantPopup({ onClose, lang, gardenPlants, hasMoestuinPlants, advice, locationName, soilType }) {
  return createPortal(
    <div className="garden-popup-overlay garden-popup-overlay--pruning" onClick={onClose}>
      <div className="garden-pruning-modal" onClick={(e) => e.stopPropagation()}>
        <AssistantScreen
          lang={lang}
          onClose={onClose}
          gardenPlants={gardenPlants}
          hasMoestuinPlants={hasMoestuinPlants}
          advice={advice}
          locationName={locationName}
          soilType={soilType}
        />
      </div>
    </div>,
    document.body
  );
}

// ── Pruning popup (bottom sheet modal) ───────────────────────────────────────

function PruningPopup({ onClose, userId, onSyncPlants, lang, latitude }) {
  return createPortal(
    <div className="garden-popup-overlay garden-popup-overlay--pruning" onClick={onClose}>
      <div className="garden-pruning-modal" onClick={(e) => e.stopPropagation()}>
        <div className="garden-pruning-scroll">
          <PruningScreen
            userId={userId}
            onSyncPlants={onSyncPlants}
            lang={lang}
            latitude={latitude}
            onClose={onClose}
          />
        </div>
      </div>
    </div>,
    document.body
  );
}


// ── Main screen ───────────────────────────────────────────────────────────────

export function MijnTuinScreen({ userId, onSyncPlants, onSyncWishlistPlants, onSyncMoestuinPlants, focusMoestuinPlantId = null, onMoestuinFocusHandled = null, lang, latitude, gardenPlants = [], hasMoestuinPlants = false, advice = null, locationName = "", soilType = "unknown" }) {
  const [openTile, setOpenTile] = useState(null);
  const [showInfo, setShowInfo] = useState(false);
  const [moestuinDetailId, setMoestuinDetailId] = useState(null);

  // A check-in push was tapped: open the moestuin sheet on that plant.
  // The id is copied to local state before clearing the App-level flag so the
  // popup keeps it for the rest of its lifetime.
  useEffect(() => {
    if (!focusMoestuinPlantId) return;
    setMoestuinDetailId(focusMoestuinPlantId);
    setOpenTile("moestuin");
    onMoestuinFocusHandled?.();
  }, [focusMoestuinPlantId, onMoestuinFocusHandled]);

  const heroLines = t(lang, "gardenHeroHeading").split("\n");

  return (
    <div className="mijn-tuin-screen">
      <div className="mijn-tuin-hero">
        <div className="mijn-tuin-hero-top-row">
          <button
            type="button"
            className="pruning-info-btn"
            onClick={() => setShowInfo(true)}
            aria-label="More info"
          >
            ⓘ
          </button>
        </div>
        <div className="mijn-tuin-hero-content">
          <h1 className="mijn-tuin-hero-heading">
            {heroLines.map((line, i) => (
              <span key={i}>
                {line}
                {i < heroLines.length - 1 && <br />}
              </span>
            ))}
          </h1>
        </div>
      </div>

      <div className="mijn-tuin-grid">
        <GardenTile
          icon={<img src={pruningShears} alt="" width="44" height="44" style={{ objectFit: "contain" }} />}
          title={t(lang, "gardenTilePruning")}
          subtitle={t(lang, "gardenTilePruningSub")}
          onClick={() => setOpenTile("pruning")}
        />
        <GardenTile
          icon="🌱"
          title={t(lang, "gardenTileWishlist")}
          subtitle={t(lang, "gardenTileWishlistSub")}
          onClick={() => setOpenTile("wishlist")}
          isPremium
        />
        <GardenTile
          icon="🥕"
          title={t(lang, "gardenTileVegetable")}
          subtitle={t(lang, "gardenTileVegetableSub")}
          onClick={() => setOpenTile("moestuin")}
          isPremium
        />
        <GardenTile
          icon="💬"
          title={t(lang, "gardenTileAI")}
          subtitle={t(lang, "gardenTileAISub")}
          onClick={() => setOpenTile("assistant")}
          isPremium
        />
      </div>

      {openTile === "assistant" && (
        <AssistantPopup
          onClose={() => setOpenTile(null)}
          lang={lang}
          gardenPlants={gardenPlants}
          hasMoestuinPlants={hasMoestuinPlants}
          advice={advice}
          locationName={locationName}
          soilType={soilType}
        />
      )}

      {openTile === "pruning" && (
        <PruningPopup
          onClose={() => setOpenTile(null)}
          userId={userId}
          onSyncPlants={onSyncPlants}
          lang={lang}
          latitude={latitude}
        />
      )}

      {openTile === "moestuin" && (
        <MoestuinPopup
          lang={lang}
          latitude={latitude}
          onClose={() => { setOpenTile(null); setMoestuinDetailId(null); }}
          onSyncPlants={onSyncMoestuinPlants}
          initialDetailPlantId={moestuinDetailId}
        />
      )}

      {openTile === "wishlist" && (
        <WishlistPopup
          lang={lang}
          latitude={latitude}
          onClose={() => setOpenTile(null)}
          onSyncPlants={onSyncWishlistPlants}
          onAddToGarden={onSyncPlants}
        />
      )}

      {showInfo && (
        <div className="garden-popup-overlay garden-popup-overlay--pruning" onClick={() => setShowInfo(false)}>
          <div className="garden-pruning-modal" style={{ height: "auto", maxHeight: "40vh" }} onClick={(e) => e.stopPropagation()}>
            <div style={{ background: "#fff", borderRadius: 24, padding: "24px 24px 32px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                <span style={{ fontFamily: "'Playfair Display', serif", fontSize: 20, fontWeight: 700, color: "#1a3d1a" }}>
                  {t(lang, "gardenInfoTitle")}
                </span>
                <button type="button" className="pruning-sheet-close" onClick={() => setShowInfo(false)}>✕</button>
              </div>
              <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 14, color: "#5a7a5a", lineHeight: 1.6, margin: 0 }}>
                {t(lang, "gardenInfoBody")}
              </p>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
