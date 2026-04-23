import React, { useRef, useState, useCallback } from "react";
import { PlantIllustration } from "./PlantIllustration";
import { t } from "../i18n";
import "./OnboardingCarousel.css";

const TOTAL_SLIDES = 5;

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

        {/* Slide 2: Plant categories */}
        <div className="onboarding-slide">
          <div className="onboarding-visual onboarding-visual--cats">
            <div className="onboarding-cat-row">
              {[["🌸", "Border"], ["🌵", lang === "nl" ? "Droogte" : "Drought"]].map(([icon, label]) => (
                <div key={icon} className="onboarding-cat-card">
                  <span className="onboarding-cat-emoji">{icon}</span>
                  <span className="onboarding-cat-label">{label}</span>
                </div>
              ))}
            </div>
            <div className="onboarding-cat-row">
              {[["🌳", lang === "nl" ? "Bomen" : "Trees"], ["🪴", lang === "nl" ? "Potten" : "Pots"]].map(([icon, label]) => (
                <div key={icon} className="onboarding-cat-card">
                  <span className="onboarding-cat-emoji">{icon}</span>
                  <span className="onboarding-cat-label">{label}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="onboarding-text">
            <h2 className="onboarding-title">
              {t(lang, "onboarding2Title").split("{PRUNE}").map((part, i) =>
                i === 0 ? part : [
                  <img key="prune-icon" src="/hedgetrimmer3.png" alt="Pruning" width="20" height="20" style={{ objectFit: "contain", verticalAlign: "middle", display: "inline-block" }} />,
                  part
                ]
              )}
            </h2>
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

        {/* Slide 4: Location */}
        <div className="onboarding-slide">
          <div className="onboarding-visual onboarding-visual--bell">
            <span className="onboarding-bell-emoji">📍</span>
          </div>
          <div className="onboarding-text">
            <h2 className="onboarding-title">{t(lang, "onboardingLocTitle")}</h2>
            <p className="onboarding-sub">{t(lang, "onboardingLocSub")}</p>
          </div>
          <div className="onboarding-push-actions">
            <button type="button" className="onboarding-allow-btn" onClick={() => { onRequestLocation?.(); goTo(4); }}>
              {t(lang, "onboardingShareLocation")}
            </button>
            <button type="button" className="onboarding-skip-inline" onClick={() => goTo(4)}>
              {t(lang, "onboardingSkipNow")}
            </button>
          </div>
        </div>

        {/* Slide 5: Push notifications */}
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
