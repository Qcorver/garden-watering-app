// Simple i18n for EN / NL. No library needed — the app surface is small.
// Usage: import { t, getDateLocale } from '../i18n';
//        t(lang, 'key')            → string
//        t(lang, 'key', { n: 5 }) → "... 5 ..."  (replaces {n})

import { nl, enUS } from "date-fns/locale";

export function getDateLocale(lang) {
  return lang === "nl" ? nl : enUS;
}

export const strings = {
  en: {
    // Tab bar
    tabBestDay: "Best Day",
    tabCalendar: "Calendar",
    tabPruning: "Pruning",

    // BestDayToWaterScreen – badge
    badgeLoading: "Loading…",
    badgeUnableToLoad: "Unable to load",
    badgeWaterToday: "Water today",
    badgeWaterTomorrow: "Water tomorrow",
    badgeWaterOn: "Water on {weekday}",
    badgeRainExpected: "Rain expected",
    badgeWellWatered: "Well watered",

    // BestDayToWaterScreen – body
    loadingWeather: "Loading weather data…",
    retry: "Retry",
    rainfallOverview: "Rainfall overview",
    last7Days: "Last 7 days",
    next3Days: "Next 3 days",
    recommendation: "Recommendation",
    wateringAdvised: "Rain insufficient — watering advised",
    wateringAdvisedTomorrow: "Rain insufficient — advised to water tomorrow",
    wateringAdvisedOn: "Rain insufficient — advised to water on {weekday}",
    noWateringNeeded: "No watering needed",
    reminders: "Reminders",
    pushNotifications: "Push notifications",
    pushNotificationsSub: "Get reminded when it's time to water",
    saving: "Saving…",
    yourLocation: "Your location",

    // Watering advice messages (UI, not push)
    msgRecentRainShort: "No watering needed — the soil is likely still wet from recent rain.",
    msgRecentWatering: "No watering needed — you watered recently and the soil should still be moist.",
    msgWeeklyRain: "No watering needed — accumulated rainfall this week has adequately moistened the soil.",
    msgUpcomingRain: "No watering needed — enough rain is expected in the coming days.",
    msgWaterNeeded: "Rain is not sufficient this week. Watering recommended: about {n} min per m².",

    // CalendarScreen
    calTitle: "Watering\nCalendar",
    calPrevMonth: "Previous month",
    calNextMonth: "Next month",
    calWeekdays: ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"],
    calLegendToday: "Today",
    calLegendBest: "Best day",
    calLegendWatered: "You watered",

    // PruningScreen
    pruneNow: "Prune now",
    pruneNextMonth: "Next month",
    pruneEdit: "Edit",
    pruneRemove: "Remove",
    pruneWindowLabel: "Pruning window",
    pruneNoData: "No data",
    pruneCycle: "Cycle",
    pruneMaintenance: "Maintenance",
    pruneSunlight: "Sunlight (species)",
    pruneYourSetting: "Your setting",
    pruneLocation: "Location",
    pruneInPot: "🪴 In Pot",
    pruneInGround: "🌱 In Ground",
    pruneEditTitle: "Edit Plant",
    pruneAddTitle: "Add Plant",
    pruneSearchPlaceholder: "Search plant species…",
    pruneMostCommon: "Most common",
    pruneSearching: "Searching…",
    pruneLoadingDetails: "Loading plant details…",
    pruneNoDataAvailable: "No pruning data available",
    pruneLightLabel: "Light",
    pruneLocationLabel: "Location",
    pruneCancel: "Cancel",
    pruneSave: "Save",
    pruneAppTitle: "GARDEN APP",
    pruneHeroHeading: "My Garden",
    pruneHeroSub: "Pruning Calendar",
    pruneEmptyTitle: "No plants yet",
    pruneEmptySub: "Tap the + button to add your first plant",
    pruneAddAriaLabel: "Add plant",
    pruneOptionsAriaLabel: "Options",
    // Camera / plant recognition
    pruneCameraAriaLabel: "Take photo to identify plant",
    pruneRecognizing: "Recognizing plant…",
    pruneRecognitionResults: "We think this is:",
    pruneRecognitionNotInDb: "not in database",
    pruneRecognitionError: "Could not identify plant. Try searching manually.",
    // Light options
    lightFullSun: "Full Sun",
    lightHalfShade: "Half Shade",
    lightShade: "Shade",
    // Location options
    locationInGround: "In Ground",
    locationInPot: "In Pot",
    // Month names (used for display in pruning calendar badge)
    monthNames: [
      "January", "February", "March", "April", "May", "June",
      "July", "August", "September", "October", "November", "December",
    ],
    monthAbbr: ["J", "F", "M", "A", "M", "J", "J", "A", "S", "O", "N", "D"],

    // LocationPicker
    locTitle: "Location",
    locDetecting: "Detecting current location...",
    locUseCurrent: "Use my current location",
    locPlaceholder: "e.g. Amsterdam",
    locSearching: "Searching…",
    locSet: "Set",
    locUsing: "Using: {name}",
    locGeoNotSupported: "Geolocation is not supported by your browser.",
    locGpsCityFailed: "Could not determine city from GPS.",
    locGpsFailed: "Failed to get location from GPS.",
    locPermDenied: "Permission denied or GPS unavailable.",
    locSearchFailed: "Location search failed.",
  },

  nl: {
    // Tab bar
    tabBestDay: "Beste Dag",
    tabCalendar: "Kalender",
    tabPruning: "Snoeien",

    // BestDayToWaterScreen – badge
    badgeLoading: "Laden…",
    badgeUnableToLoad: "Laden mislukt",
    badgeWaterToday: "Vandaag sproeien",
    badgeWaterTomorrow: "Morgen sproeien",
    badgeWaterOn: "Sproeien op {weekday}",
    badgeRainExpected: "Regen verwacht",
    badgeWellWatered: "Vochtig genoeg",

    // BestDayToWaterScreen – body
    loadingWeather: "Weergegevens laden…",
    retry: "Opnieuw",
    rainfallOverview: "Neerslagoverzicht",
    last7Days: "Afgelopen 7 dagen",
    next3Days: "Komende 3 dagen",
    recommendation: "Advies",
    wateringAdvised: "Te weinig regen — sproeien aanbevolen",
    wateringAdvisedTomorrow: "Te weinig regen — morgen sproeien aanbevolen",
    wateringAdvisedOn: "Te weinig regen — sproeien aanbevolen op {weekday}",
    noWateringNeeded: "Geen besproeïng nodig",
    reminders: "Herinneringen",
    pushNotifications: "Pushmeldingen",
    pushNotificationsSub: "Ontvang een melding wanneer het tijd is om te sproeien",
    saving: "Opslaan…",
    yourLocation: "Jouw locatie",

    // Watering advice messages (UI, not push)
    msgRecentRainShort: "Geen besproeïng nodig — de grond is waarschijnlijk nog nat van de recente regen.",
    msgRecentWatering: "Geen besproeïng nodig — je hebt recent gesproeid en de grond zou nog vochtig moeten zijn.",
    msgWeeklyRain: "Geen besproeïng nodig — de neerslag deze week heeft de grond voldoende bevochtigd.",
    msgUpcomingRain: "Geen besproeïng nodig — er wordt de komende dagen voldoende regen verwacht.",
    msgWaterNeeded: "Te weinig regen deze week. Sproeien aanbevolen: ongeveer {n} min per m².",

    // CalendarScreen
    calTitle: "Sproei Kalender",
    calPrevMonth: "Vorige maand",
    calNextMonth: "Volgende maand",
    calWeekdays: ["Ma", "Di", "Wo", "Do", "Vr", "Za", "Zo"],
    calLegendToday: "Vandaag",
    calLegendBest: "Beste dag",
    calLegendWatered: "Gesproeid",

    // PruningScreen
    pruneNow: "Nu snoeien",
    pruneNextMonth: "Volgende maand",
    pruneEdit: "Bewerken",
    pruneRemove: "Verwijderen",
    pruneWindowLabel: "Snoeiperiode",
    pruneNoData: "Geen gegevens",
    pruneCycle: "Levenscyclus",
    pruneMaintenance: "Onderhoud",
    pruneSunlight: "Zonlicht (soort)",
    pruneYourSetting: "Jouw instelling",
    pruneLocation: "Locatie",
    pruneInPot: "🪴 In pot",
    pruneInGround: "🌱 In de grond",
    pruneEditTitle: "Plant bewerken",
    pruneAddTitle: "Plant toevoegen",
    pruneSearchPlaceholder: "Zoek plantensoort…",
    pruneMostCommon: "Meest voorkomend",
    pruneSearching: "Zoeken…",
    pruneLoadingDetails: "Plantgegevens laden…",
    pruneNoDataAvailable: "Geen snoeigegevens beschikbaar",
    pruneLightLabel: "Licht",
    pruneLocationLabel: "Locatie",
    pruneCancel: "Annuleren",
    pruneSave: "Opslaan",
    pruneAppTitle: "TUINAPP",
    pruneHeroHeading: "Mijn Tuin",
    pruneHeroSub: "Snoei Kalender",
    pruneEmptyTitle: "Nog geen planten",
    pruneEmptySub: "Tik op de + knop om je eerste plant toe te voegen",
    pruneAddAriaLabel: "Plant toevoegen",
    pruneOptionsAriaLabel: "Opties",
    // Camera / plant recognition
    pruneCameraAriaLabel: "Maak foto om plant te identificeren",
    pruneRecognizing: "Plant herkennen…",
    pruneRecognitionResults: "Wij denken dat dit is:",
    pruneRecognitionNotInDb: "niet in database",
    pruneRecognitionError: "Plant kon niet worden herkend. Probeer handmatig te zoeken.",
    // Light options
    lightFullSun: "Volle zon",
    lightHalfShade: "Halfschaduw",
    lightShade: "Schaduw",
    // Location options
    locationInGround: "In de grond",
    locationInPot: "In pot",
    // Month names (display only — data matching always uses English keys)
    monthNames: [
      "Januari", "Februari", "Maart", "April", "Mei", "Juni",
      "Juli", "Augustus", "September", "Oktober", "November", "December",
    ],
    monthAbbr: ["J", "F", "M", "A", "M", "J", "J", "A", "S", "O", "N", "D"],

    // LocationPicker
    locTitle: "Locatie",
    locDetecting: "Locatie detecteren...",
    locUseCurrent: "Gebruik mijn huidige locatie",
    locPlaceholder: "bijv. Amsterdam",
    locSearching: "Zoeken…",
    locSet: "Instellen",
    locUsing: "Gebruikt: {name}",
    locGeoNotSupported: "Geolocatie wordt niet ondersteund door uw browser.",
    locGpsCityFailed: "Kon stad niet bepalen via GPS.",
    locGpsFailed: "Locatie ophalen via GPS mislukt.",
    locPermDenied: "Toestemming geweigerd of GPS niet beschikbaar.",
    locSearchFailed: "Locatie zoeken mislukt.",
  },
};

/**
 * Translate a key into the given language.
 * Vars like {n} or {name} are replaced with the provided values.
 * Falls back to English if the key is missing in the target language.
 */
export function t(lang, key, vars = {}) {
  const s = strings[lang]?.[key] ?? strings.en[key] ?? key;
  if (typeof s !== "string") return s; // arrays (weekdays, monthNames) returned as-is
  return Object.entries(vars).reduce(
    (acc, [k, v]) => acc.replace(`{${k}}`, String(v)),
    s,
  );
}
