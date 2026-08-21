import React, { useRef, useState, useCallback } from "react";
import { PlantIllustration } from "./PlantIllustration";
import { t } from "../i18n";

import "./OnboardingCarousel.css";

const TOTAL_SLIDES = 6;

export function OnboardingCarousel({ onComplete, onRequestPush, onRequestLocation, lang = "en" }) {
  const trackRef = useRef(null);
  const [currentSlide, setCurrentSlide] = useState(0);

  const goTo = useCallback((index) => {
    const track = trackRef.current;
    if (!track) return;
    track.scrollTo({ left: index * track.offsetWidth, behavior: "smooth" });
  }, []);

  const handleScroll = useCallback(() => {
    const track = trackRef.current;
    if (!track) return;
    const slide = Math.round(track.scrollLeft / track.offsetWidth);
    setCurrentSlide(slide);
  }, []);

  function handleAllow() {
    onRequestPush?.();
    onComplete();
  }

  const isLast = currentSlide === TOTAL_SLIDES - 1;

  const badges = [
    { color: "#f87171", text: t(lang, "wateredTodayQuestion") },
    { color: "#fb923c", text: t(lang, "badgeWaterTomorrow") },
    { color: "#60a5fa", text: t(lang, "badgeRainExpected") },
    { color: "#34d399", text: t(lang, "badgeWellWatered") },
    { color: "#34d399", text: t(lang, "wateredToday") },
  ];

  const gardenTiles = [
    [<img key="shears" src="/hedgetrimmer3.png" alt="" width="36" height="36" style={{ objectFit: "contain" }} />, t(lang, "gardenTilePruning")],
    ["🌱", t(lang, "gardenTileWishlist")],
    ["🥕", t(lang, "gardenTileVegetable")],
    ["💬", t(lang, "gardenTileAI")],
  ];

  return (
    <div className="onboarding">
      {!isLast && (
        <button type="button" className="onboarding-skip-btn" onClick={() => goTo(TOTAL_SLIDES - 1)}>
          {t(lang, "onboardingSkip")}
        </button>
      )}

      <div className="onboarding-track" ref={trackRef} onScroll={handleScroll}>

        {/* Slide 1: Welcome */}
        <div className="onboarding-slide">
          <div className="onboarding-visual">
            <PlantIllustration weather="sunny" soilWet={true} />
          </div>
          <div className="onboarding-text">
            <h2 className="onboarding-title">{t(lang, "onboarding1Title")}</h2>
            <p className="onboarding-sub">{t(lang, "onboarding1Sub")}</p>
          </div>
        </div>

        {/* Slide 2: Badge states */}
        <div className="onboarding-slide">
          <div className="onboarding-visual onboarding-visual--badges">
            {badges.map(({ color, text }, i) => (
              <div key={i} className="onboarding-badge-item">
                <span className="onboarding-badge-dot" style={{ background: color }} />
                <span>{text}</span>
              </div>
            ))}
          </div>
          <div className="onboarding-text">
            <h2 className="onboarding-title">{t(lang, "onboarding2Title")}</h2>
            <p className="onboarding-sub">{t(lang, "onboarding2Sub")}</p>
          </div>
        </div>

        {/* Slide 3: Log your watering */}
        <div className="onboarding-slide">
          <div className="onboarding-visual onboarding-visual--calendar">
            <div className="onboarding-cal-demo">
              <div className="onboarding-cal-weekdays">
                {(lang === "nl"
                  ? ["Ma", "Di", "Wo", "Do", "Vr", "Za", "Zo"]
                  : ["M", "T", "W", "T", "F", "S", "S"]
                ).map((d, i) => (
                  <span key={i} className="onboarding-cal-wd">{d}</span>
                ))}
              </div>
              <div className="onboarding-cal-cells">
                {[...Array(7)].map((_, i) => (
                  <div
                    key={i}
                    className={`onboarding-cal-cell${
                      i === 2 ? " onboarding-cal-cell--watered" :
                      i === 5 ? " onboarding-cal-cell--best" : ""
                    }`}
                  />
                ))}
              </div>
            </div>
          </div>
          <div className="onboarding-text">
            <h2 className="onboarding-title">{t(lang, "onboarding3Title")}</h2>
            <p className="onboarding-sub">{t(lang, "onboarding3Sub")}</p>
          </div>
        </div>

        {/* Slide 4: Mijn tuin */}
        <div className="onboarding-slide">
          <div className="onboarding-visual onboarding-visual--cats">
            <div className="onboarding-cam-chip">
              <span className="onboarding-cam-chip-icon">📷</span>
              <span>{t(lang, "onboardingGardenCamChip")}</span>
            </div>
            <div className="onboarding-cat-row">
              {gardenTiles.slice(0, 2).map(([icon, label]) => (
                <div key={label} className="onboarding-cat-card">
                  <span className="onboarding-cat-emoji">{icon}</span>
                  <span className="onboarding-cat-label">{label}</span>
                </div>
              ))}
            </div>
            <div className="onboarding-cat-row">
              {gardenTiles.slice(2).map(([icon, label]) => (
                <div key={label} className="onboarding-cat-card">
                  <span className="onboarding-cat-emoji">{icon}</span>
                  <span className="onboarding-cat-label">{label}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="onboarding-text">
            <h2 className="onboarding-title">{t(lang, "onboardingGardenTitle")}</h2>
            <p className="onboarding-sub">{t(lang, "onboardingGardenSub")}</p>
          </div>
        </div>

        {/* Slide 5: Location */}
        <div className="onboarding-slide">
          <div className="onboarding-visual onboarding-visual--bell">
            <span className="onboarding-bell-emoji">📍</span>
          </div>
          <div className="onboarding-text">
            <h2 className="onboarding-title">{t(lang, "onboardingLocTitle")}</h2>
            <p className="onboarding-sub">{t(lang, "onboardingLocSub")}</p>
          </div>
          <div className="onboarding-push-actions">
            <button type="button" className="onboarding-allow-btn" onClick={() => { onRequestLocation?.(); goTo(5); }}>
              {t(lang, "onboardingShareLocation")}
            </button>
            <button type="button" className="onboarding-skip-inline" onClick={() => goTo(5)}>
              {t(lang, "onboardingSkipNow")}
            </button>
          </div>
        </div>

        {/* Slide 6: Push notifications */}
        <div className="onboarding-slide onboarding-slide--last">
          <div className="onboarding-visual onboarding-visual--bell">
            <span className="onboarding-bell-emoji">🔔</span>
          </div>
          <div className="onboarding-text">
            <h2 className="onboarding-title">{t(lang, "onboarding4Title")}</h2>
            <p className="onboarding-sub">{t(lang, "onboarding4Sub")}</p>
          </div>
          <div className="onboarding-push-actions">
            <button type="button" className="onboarding-allow-btn" onClick={handleAllow}>
              {t(lang, "onboardingAllow")}
            </button>
            <button type="button" className="onboarding-skip-inline" onClick={onComplete}>
              {t(lang, "onboardingSkipNow")}
            </button>
          </div>
        </div>

      </div>

      {/* Footer: dots + next button */}
      <div className="onboarding-footer">
        <div className="onboarding-dots">
          {[...Array(TOTAL_SLIDES)].map((_, i) => (
            <button
              key={i}
              type="button"
              className={`onboarding-dot${i === currentSlide ? " onboarding-dot--active" : ""}`}
              onClick={() => goTo(i)}
              aria-label={`Slide ${i + 1}`}
            />
          ))}
        </div>
        {!isLast && (
          <button type="button" className="onboarding-next-btn" onClick={() => goTo(currentSlide + 1)}>
            {t(lang, "onboardingNext")} →
          </button>
        )}
      </div>
    </div>
  );
}
