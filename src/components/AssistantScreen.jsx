import React, { useState, useRef, useEffect } from "react";
import { streamAssistant } from "../api/assistantClient";
import { compressImage } from "../api/plantIdentifyClient";
import { t } from "../i18n";
import "./AssistantScreen.css";

// Per-category metadata: icon + i18n keys for card, greeting and chips.
const CATEGORIES = [
  {
    key: "doctor",
    icon: "🩺",
    titleKey: "assistantCardDoctor",
    subKey: "assistantCardDoctorSub",
    greetingKey: "assistantGreetingDoctor",
    chipKeys: ["assistantChipYellow", "assistantChipDroopy", "assistantChipSpots", "assistantChipBrown"],
  },
  {
    key: "garden",
    icon: "🌳",
    titleKey: "assistantCardGarden",
    subKey: "assistantCardGardenSub",
    greetingKey: "assistantGreetingGarden",
    chipKeys: ["assistantChipBloom", "assistantChipWinter", "assistantChipPrune", "assistantChipBee"],
  },
  {
    key: "general",
    icon: "💬",
    titleKey: "assistantCardOther",
    subKey: "assistantCardOtherSub",
    greetingKey: "assistantGreetingOther",
    chipKeys: ["assistantChipLawn", "assistantChipVeg", "assistantChipWhichPlant"],
  },
];

export function AssistantScreen({
  lang,
  onClose,
  gardenPlants = [],
  hasMoestuinPlants = false,
  advice = null,
  locationName = "",
  soilType = "unknown",
}) {
  const [category, setCategory] = useState(null); // null = category picker
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [errorKey, setErrorKey] = useState(null);
  const [pendingImage, setPendingImage] = useState(null); // { base64, previewUrl }

  const messagesRef = useRef(null);
  const cameraInputRef = useRef(null);
  const abortRef = useRef(null);

  const activeCategory = CATEGORIES.find((c) => c.key === category) ?? null;

  // Keep the newest message in view while streaming.
  useEffect(() => {
    const el = messagesRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, isStreaming]);

  // Abort an in-flight stream when the popup closes mid-answer.
  useEffect(() => () => abortRef.current?.abort(), []);

  function openCategory(key) {
    setCategory(key);
    setMessages([]);
    setInput("");
    setErrorKey(null);
    setPendingImage(null);
  }

  function goBack() {
    abortRef.current?.abort();
    setIsStreaming(false);
    setCategory(null);
  }

  function buildContext() {
    return {
      locationName,
      soilType,
      hasMoestuin: hasMoestuinPlants,
      plants: (gardenPlants ?? []).map((p) => ({
        name: p.commonName,
        scientificName: p.scientificName,
        category: p.waterCategory,
        inPot: p.inPot,
        pruningMonths: p.pruningMonths,
        sunlight: p.sunlight,
        cycle: p.cycle,
        maintenance: p.maintenance,
      })),
      advice: advice
        ? {
            shouldWater: advice.shouldWater,
            message: advice.message,
            rainLast7: advice.rainLast7,
            rainNext3: advice.rainNext3,
            weeklyTarget: advice.weeklyTarget,
            daysSinceLastWatering: advice.daysSinceLastWatering,
          }
        : undefined,
    };
  }

  async function handleCameraCapture(file) {
    if (!file) return;
    try {
      const base64 = await compressImage(file);
      setPendingImage({ base64, previewUrl: `data:image/jpeg;base64,${base64}` });
      setErrorKey(null);
    } catch {
      setErrorKey("assistantErrorGeneric");
    }
  }

  async function handleSend() {
    const text = input.trim();
    if ((!text && !pendingImage) || isStreaming) return;

    const userMsg = {
      role: "user",
      text,
      image: pendingImage?.base64,
      imageMimeType: pendingImage ? "image/jpeg" : undefined,
      imagePreview: pendingImage?.previewUrl,
    };
    const history = [...messages, userMsg];
    setMessages([...history, { role: "assistant", text: "" }]);
    setInput("");
    setPendingImage(null);
    setErrorKey(null);
    setIsStreaming(true);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      await streamAssistant({
        category,
        lang,
        context: buildContext(),
        signal: controller.signal,
        messages: history.map(({ role, text: msgText, image, imageMimeType }) => ({
          role,
          text: msgText,
          image,
          imageMimeType,
        })),
        onDelta: (full) => {
          setMessages((prev) => {
            const next = [...prev];
            const last = next[next.length - 1];
            if (last?.role === "assistant") next[next.length - 1] = { ...last, text: full };
            return next;
          });
        },
      });
    } catch (e) {
      if (e.name !== "AbortError") {
        setErrorKey(e.code === "rate_limit" ? "assistantErrorLimit" : "assistantErrorGeneric");
      }
      // Drop the empty assistant placeholder if nothing streamed in.
      setMessages((prev) => {
        const last = prev[prev.length - 1];
        return last?.role === "assistant" && !last.text ? prev.slice(0, -1) : prev;
      });
    } finally {
      setIsStreaming(false);
    }
  }

  function handleKeyDown(e) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  // ── Category picker ────────────────────────────────────────────────────────
  if (!activeCategory) {
    return (
      <div className="assistant-screen">
        <div className="assistant-header">
          <span className="assistant-title">{t(lang, "assistantTitle")}</span>
          <button type="button" className="pruning-sheet-close" onClick={onClose}>✕</button>
        </div>
        <div className="assistant-home">
          <p className="assistant-intro">{t(lang, "assistantIntro")}</p>
          {CATEGORIES.map((c) => (
            <button
              key={c.key}
              type="button"
              className="assistant-card"
              onClick={() => openCategory(c.key)}
            >
              <span className="assistant-card-icon">{c.icon}</span>
              <span className="assistant-card-text">
                <span className="assistant-card-title">{t(lang, c.titleKey)}</span>
                <span className="assistant-card-sub">{t(lang, c.subKey)}</span>
              </span>
              <span className="assistant-card-chevron">›</span>
            </button>
          ))}
          <p className="assistant-disclaimer">{t(lang, "assistantDisclaimer")}</p>
        </div>
      </div>
    );
  }

  // ── Chat view ──────────────────────────────────────────────────────────────
  return (
    <div className="assistant-screen assistant-screen--chat">
      <div className="assistant-header">
        <button type="button" className="assistant-back" onClick={goBack} aria-label="Back">‹</button>
        <span className="assistant-title assistant-title--chat">
          {activeCategory.icon} {t(lang, activeCategory.titleKey)}
        </span>
        <button type="button" className="pruning-sheet-close" onClick={onClose}>✕</button>
      </div>

      <div className="assistant-messages" ref={messagesRef}>
        <div className="assistant-bubble assistant-bubble--assistant">
          {t(lang, activeCategory.greetingKey)}
        </div>

        {messages.map((m, i) => (
          <div
            key={i}
            className={`assistant-bubble assistant-bubble--${m.role === "user" ? "user" : "assistant"}`}
          >
            {m.imagePreview && (
              <img className="assistant-bubble-image" src={m.imagePreview} alt="" />
            )}
            {m.role === "assistant" && !m.text && isStreaming ? (
              <span className="assistant-typing">
                <span /><span /><span />
              </span>
            ) : (
              m.text
            )}
          </div>
        ))}

        {errorKey && (
          <div className="assistant-bubble assistant-bubble--error">{t(lang, errorKey)}</div>
        )}
      </div>

      {messages.length === 0 && (
        <div className="assistant-chips">
          {activeCategory.chipKeys.map((chipKey) => (
            <button
              key={chipKey}
              type="button"
              className="assistant-chip"
              onClick={() => setInput(t(lang, chipKey))}
            >
              {t(lang, chipKey)}
            </button>
          ))}
        </div>
      )}

      {pendingImage && (
        <div className="assistant-pending-image">
          <img src={pendingImage.previewUrl} alt="" />
          <button
            type="button"
            className="assistant-pending-image-remove"
            onClick={() => setPendingImage(null)}
            aria-label="Remove photo"
          >
            ✕
          </button>
        </div>
      )}

      <div className="assistant-input-row">
        {category === "doctor" && (
          <button
            type="button"
            className="assistant-camera-btn"
            onClick={() => cameraInputRef.current?.click()}
            aria-label={t(lang, "assistantPhotoCta")}
          >
            📷
          </button>
        )}
        <input
          className="assistant-input"
          type="text"
          value={input}
          placeholder={
            category === "doctor" && !pendingImage && messages.length === 0
              ? t(lang, "assistantPhotoCta")
              : t(lang, "assistantInputPlaceholder")
          }
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
        />
        <button
          type="button"
          className="assistant-send-btn"
          onClick={handleSend}
          disabled={isStreaming || (!input.trim() && !pendingImage)}
          aria-label={t(lang, "assistantSend")}
        >
          ➤
        </button>
      </div>

      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        style={{ display: "none" }}
        onChange={(e) => {
          const file = e.target.files?.[0];
          // Reset value so re-capturing the same file still fires onChange
          // (Android WebView quirk — same fix as PruningScreen).
          e.target.value = "";
          handleCameraCapture(file);
        }}
      />
    </div>
  );
}
