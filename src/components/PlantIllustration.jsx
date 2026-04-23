import React from "react";

/**
 * Composable plant illustration covering all 6 weather × soil scenarios.
 *
 * @param {{ weather: 'sunny'|'cloudy'|'rain', soilWet: boolean }} props
 *   weather  – current sky condition  (default: 'sunny')
 *   soilWet  – true = healthy upright plant, false = wilting thirsty plant
 */
export function PlantIllustration({ weather = "sunny", soilWet = true }) {
  const isRain   = weather === "rain";
  const showCloud = weather === "cloudy" || isRain;

  const label = `${soilWet ? "Healthy" : "Thirsty"} plant in ${weather} weather`;
  const cls = [
    "plant-illustration",
    `plant-illustration--${weather}`,
    `plant-illustration--${soilWet ? "healthy" : "thirsty"}`,
  ].join(" ");

  return (
    <svg className={cls} viewBox="0 0 160 160" xmlns="http://www.w3.org/2000/svg" aria-label={label}>

      {/* ── Sun ── */}
      {weather === "sunny" && (
        <g className="sun-element">
          <line x1="128" y1="28" x2="128" y2="18" stroke="#f4a820" strokeWidth="2" strokeLinecap="round"/>
          <line x1="138" y1="38" x2="146" y2="32" stroke="#f4a820" strokeWidth="2" strokeLinecap="round"/>
          <line x1="142" y1="50" x2="152" y2="50" stroke="#f4a820" strokeWidth="2" strokeLinecap="round"/>
          <line x1="138" y1="62" x2="146" y2="68" stroke="#f4a820" strokeWidth="2" strokeLinecap="round"/>
          <line x1="118" y1="28" x2="114" y2="20" stroke="#f4a820" strokeWidth="2" strokeLinecap="round"/>
          <circle cx="128" cy="50" r="13" fill="#f9c74f"/>
        </g>
      )}

      {/* ── Cloud (cloudy or rain) ── */}
      {showCloud && (
        <g className="cloud-element">
          <circle cx="60" cy="36" r="14" fill="#93b8d8"/>
          <circle cx="78" cy="28" r="18" fill="#b0ccdf"/>
          <circle cx="97" cy="36" r="13" fill="#93b8d8"/>
          <rect x="46" y="36" width="64" height="16" fill="#b0ccdf"/>
          <rect x="46" y="46" width="64" height="6" rx="3" fill="#b0ccdf"/>
        </g>
      )}

      {/* ── Raindrops (rain only) ── */}
      {isRain && (
        <g className="raindrops">
          <line className="raindrop" x1="58"  y1="60" x2="55"  y2="72" stroke="#5b9bd5" strokeWidth="2.2" strokeLinecap="round"/>
          <line className="raindrop" x1="72"  y1="64" x2="69"  y2="78" stroke="#5b9bd5" strokeWidth="2.2" strokeLinecap="round"/>
          <line className="raindrop" x1="86"  y1="58" x2="83"  y2="72" stroke="#5b9bd5" strokeWidth="2.2" strokeLinecap="round"/>
          <line className="raindrop" x1="100" y1="62" x2="97"  y2="75" stroke="#5b9bd5" strokeWidth="2.2" strokeLinecap="round"/>
          <line className="raindrop" x1="65"  y1="74" x2="63"  y2="84" stroke="#5b9bd5" strokeWidth="1.8" strokeLinecap="round" opacity="0.6"/>
          <line className="raindrop" x1="92"  y1="72" x2="90"  y2="82" stroke="#5b9bd5" strokeWidth="1.8" strokeLinecap="round" opacity="0.6"/>
        </g>
      )}

      {/* ── Healthy plant (soil wet) ── */}
      {soilWet && (
        <g className="plant-body">
          {/* Pot */}
          <path d="M52 132 L58 108 L102 108 L108 132 Z" fill="#c2855a"/>
          <rect x="50" y="128" width="60" height="6" rx="3" fill="#a86a40"/>
          <rect x="55" y="107" width="50" height="7" rx="3" fill="#d4956a"/>
          {/* Moist soil */}
          <ellipse cx="80" cy="108" rx="25" ry="5" fill="#6b4226"/>
          {/* Upright stem */}
          <path d="M80 107 C80 95, 80 80, 80 64" stroke="#4a9a30" strokeWidth="3" fill="none" strokeLinecap="round"/>
          {/* Leaves */}
          <path d="M80 90 C68 84, 56 86, 54 96 C64 94, 74 90, 80 90 Z" fill="#5ab840"/>
          <path d="M80 78 C92 72, 104 74, 106 84 C96 82, 86 78, 80 78 Z" fill="#5ab840"/>
          {/* Upright flower */}
          <g transform="translate(80,60)">
            <ellipse cx="0" cy="-11" rx="5" ry="8" fill="#f87171" opacity="0.9"/>
            <ellipse cx="0" cy="-11" rx="5" ry="8" fill="#f87171" opacity="0.9" transform="rotate(72)"/>
            <ellipse cx="0" cy="-11" rx="5" ry="8" fill="#f87171" opacity="0.9" transform="rotate(144)"/>
            <ellipse cx="0" cy="-11" rx="5" ry="8" fill="#f87171" opacity="0.9" transform="rotate(216)"/>
            <ellipse cx="0" cy="-11" rx="5" ry="8" fill="#f87171" opacity="0.9" transform="rotate(288)"/>
            <circle cx="0" cy="0" r="7" fill="#fbbf24"/>
          </g>
        </g>
      )}

      {/* ── Thirsty plant (soil dry) ── */}
      {!soilWet && (
        <g className="plant-body">
          {/* Pot */}
          <path d="M52 132 L58 108 L102 108 L108 132 Z" fill="#c2855a"/>
          <rect x="50" y="128" width="60" height="6" rx="3" fill="#a86a40"/>
          <rect x="55" y="107" width="50" height="7" rx="3" fill="#d4956a"/>
          {/* Dry cracked soil */}
          <ellipse cx="80" cy="108" rx="25" ry="5" fill="#b5813d"/>
          <path d="M70 106 L68 112" stroke="#7a5220" strokeWidth="1.2" strokeLinecap="round"/>
          <path d="M80 105 L82 111" stroke="#7a5220" strokeWidth="1.2" strokeLinecap="round"/>
          <path d="M89 106 L87 110" stroke="#7a5220" strokeWidth="1.2" strokeLinecap="round"/>
          <path d="M74 110 L72 114" stroke="#7a5220" strokeWidth="1" strokeLinecap="round"/>
          {/* Drooping stem */}
          <path d="M80 107 C80 95, 78 82, 72 70 C66 58, 60 52, 56 44" stroke="#6aaa4e" strokeWidth="3" fill="none" strokeLinecap="round"/>
          {/* Wilting leaves */}
          <path d="M68 78 C56 74, 46 78, 44 88 C54 86, 64 80, 68 78 Z" fill="#85c06a"/>
          <path d="M70 65 C76 55, 86 53, 92 59 C84 63, 74 65, 70 65 Z" fill="#85c06a"/>
          {/* Drooping flower */}
          <g transform="translate(56,44) rotate(25)">
            <ellipse cx="0" cy="-10" rx="5" ry="8" fill="#f4c842" opacity="0.9"/>
            <ellipse cx="0" cy="-10" rx="5" ry="8" fill="#f4c842" opacity="0.9" transform="rotate(72)"/>
            <ellipse cx="0" cy="-10" rx="5" ry="8" fill="#f4c842" opacity="0.9" transform="rotate(144)"/>
            <ellipse cx="0" cy="-10" rx="5" ry="8" fill="#f4c842" opacity="0.9" transform="rotate(216)"/>
            <ellipse cx="0" cy="-10" rx="5" ry="8" fill="#f4c842" opacity="0.9" transform="rotate(288)"/>
            <circle cx="0" cy="0" r="7" fill="#e8a020"/>
          </g>
        </g>
      )}

    </svg>
  );
}
