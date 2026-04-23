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
    tabHerbs: "Herbs & Veggies",

    // BestDayToWaterScreen – badge
    badgeLoading: "Loading…",
    badgeUnableToLoad: "Unable to load",
    badgeWaterToday: "Water today",
    badgeWaterTomorrow: "Water tomorrow",
    badgeWaterOn: "Water on {weekday}",
    badgeRainExpected: "Rain expected",
    badgeWellWatered: "Well watered",
    wateredTodayQuestion: "Did you water today?",
    wateredToday: "Watered today",
    wateredYesterday: "Watered yesterday",

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
    calInfoTitle: "How the calendar works",
    calInfoBody: "Tap any past day to mark it as watered — this counts toward your weekly budget and affects the recommendation. The highlighted day is the best day to water based on the forecast. Weather icons show actual rainfall and cloud cover for past days, and the upcoming forecast for future days.",

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
    pruneEnriching: "Looking up plant data…",
    pruneEnrichError: "Could not load plant data. Try searching manually.",
    // Info sheet
    pruneInfoTitle: "About this tab",
    pruneInfoBody: "Add your own plants by searching or by taking a photo — the app will identify the plant for you. Plants that need pruning soonest always appear at the top. You'll receive a push notification when it's time to prune.",
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

    // HerbsScreen
    herbHeroHeading: "Herbs &\nVeggies",
    herbHeroSub: "Herbs & Vegetables",
    herbEmptyTitle: "No herbs yet",
    herbEmptySub: "Tap + to add herbs and vegetables",
    herbAddAriaLabel: "Add herb or vegetable",
    herbHarvestLabel: "Growing season",

    // Watering categories (home screen + plant edit popup)
    catVegetable: "Herbs & veggies",
    catBorder: "Border & shrubs",
    catDrought: "Drought-tolerant",
    catTrees: "Trees & native",
    catPots: "Pots & containers",
    catWateringCategory: "Watering category",
    catSelectPlaceholder: "Select after choosing a species",
    catAddPlantsPrompt: "Add plants in the Pruning or Herbs & Veggies tabs for tailored advice per plant type.",
    catYourPlants: "Your plants",
    catNoPlants: "No plants in this category yet.",

    // Settings tab
    tabSettings: "Settings",
    settingsHeroHeading: "Settings",
    settingsHeroSub: "Preferences & location",
    settingsSoilType: "Soil type",
    settingsSoilTypeSub: "Affects how much water your garden needs",
    soilUnknown: "Don't know",
    soilSandy: "Sandy (drains fast)",
    soilLoamy: "Loamy (balanced)",
    soilClay: "Clay (retains water)",
    soilChalky: "Chalky (moderate drainage)",
    soilPeat: "Peat (retains a lot of water)",
    settingsSensitivity: "Recommendation sensitivity",
    settingsSensitivitySub: "Adjust how often you get a watering recommendation",
    settingsSensitivityLess: "-50%",
    settingsSensitivityMore: "+50%",

    // Onboarding carousel
    onboardingSkip: "Skip",
    onboardingNext: "Next",
    onboarding1Title: "Weather-based watering, tailored to your garden",
    onboarding1Sub: "Science-based advice, updated daily",
    onboarding2Title: "Add plants in {PRUNE}- pruning for advice per plant type",
    onboarding2Sub: "Each category gets its own watering schedule",
    onboarding3Title: "Tap a calendar day when you watered",
    onboarding3Sub: "It counts toward your weekly water budget",
    onboardingLocTitle: "Where is your garden?",
    onboardingLocSub: "We use your location for daily rain and forecast data. You can update it anytime in the Settings tab.",
    onboardingShareLocation: "Share my location",
    onboarding4Title: "Get a daily nudge at 10am when watering is needed",
    onboarding4Sub: "Only sent when your garden actually needs it",
    onboardingAllow: "Allow notifications",
    onboardingSkipNow: "Skip for now",

    // Info sheets (item 5)
    infoRainfallTitle: "Rainfall overview",
    infoRainfallBody: "Last 7 days shows measured rain at your location. Next 3 days shows the forecast from OpenWeather. Together they determine whether your garden needs extra water this week.",
    infoRecTitle: "How this works",
    infoRecBody: "We estimate how much water your garden loses each day to evaporation, based on temperature and your latitude (ET₀). If this week's rain and your logged watering don't cover the weekly need, we recommend topping up.\n\nThe advice is shown per plant category, based on the plants you've added in the Pruning tab. Each category (e.g. trees, shrubs, lawn) has its own watering needs.",

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
    tabHerbs: "Moestuin",

    // BestDayToWaterScreen – badge
    badgeLoading: "Laden…",
    badgeUnableToLoad: "Laden mislukt",
    badgeWaterToday: "Vandaag sproeien",
    badgeWaterTomorrow: "Morgen sproeien",
    badgeWaterOn: "Sproeien op {weekday}",
    badgeRainExpected: "Regen verwacht",
    badgeWellWatered: "Vochtig genoeg",
    wateredTodayQuestion: "Vandaag gesproeid?",
    wateredToday: "Vandaag gesproeid",
    wateredYesterday: "Gisteren gesproeid",

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
    calInfoTitle: "Hoe de kalender werkt",
    calInfoBody: "Tik op een dag in het verleden om hem als gesproeid te markeren — dit telt mee in je weekbudget en beïnvloedt het advies. De gemarkeerde dag is de beste dag om te sproeien op basis van de voorspelling. Weericonen tonen werkelijke neerslag en bewolking voor verleden dagen, en de voorspelling voor toekomstige dagen.",

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
    pruneEnriching: "Plantendata ophalen…",
    pruneEnrichError: "Plantendata kon niet worden geladen. Probeer handmatig te zoeken.",
    // Info sheet
    pruneInfoTitle: "Over dit tabblad",
    pruneInfoBody: "Voeg je eigen planten toe door te zoeken of een foto te maken — de app herkent de plant voor je. Planten die het eerst gesnoeid moeten worden staan bovenaan. Je ontvangt een pushmelding wanneer het tijd is om te snoeien.",
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

    // HerbsScreen
    herbHeroHeading: "Moes-\ntuin",
    herbHeroSub: "Kruiden & Groenten",
    herbEmptyTitle: "Nog geen kruiden",
    herbEmptySub: "Tik op + om kruiden en groenten toe te voegen",
    herbAddAriaLabel: "Kruid of groente toevoegen",
    herbHarvestLabel: "Groeiseizoen",

    // Watering categories (home screen + plant edit popup)
    catVegetable: "Moestuin",
    catBorder: "Border & heesters",
    catDrought: "Droogtetolerant",
    catTrees: "Bomen & inheems",
    catPots: "Potten & bakken",
    catWateringCategory: "Watercategorie",
    catSelectPlaceholder: "Selecteer na het kiezen van een soort",
    catAddPlantsPrompt: "Voeg planten toe in de tabs Snoeien of Moestuin voor specifiek advies per plantensoort.",
    catYourPlants: "Jouw planten",
    catNoPlants: "Nog geen planten in deze categorie.",

    // Settings tab
    tabSettings: "Instellingen",
    settingsHeroHeading: "Instellingen",
    settingsHeroSub: "Voorkeuren & locatie",
    settingsSoilType: "Bodemtype",
    settingsSoilTypeSub: "Beïnvloedt hoeveel water je tuin nodig heeft",
    soilUnknown: "Weet ik niet",
    soilSandy: "Zand (droogt snel)",
    soilLoamy: "Leem (gebalanceerd)",
    soilClay: "Klei (houdt water vast)",
    soilChalky: "Kalk (matige afwatering)",
    soilPeat: "Veen (houdt veel water vast)",
    settingsSensitivity: "Gevoeligheid aanbeveling",
    settingsSensitivitySub: "Pas aan hoe vaak je een sproeiadvies krijgt",
    settingsSensitivityLess: "-50%",
    settingsSensitivityMore: "+50%",

    // Onboarding carousel
    onboardingSkip: "Overslaan",
    onboardingNext: "Volgende",
    onboarding1Title: "Weergestuurd sproeiadvies, afgestemd op jouw tuin",
    onboarding1Sub: "Wetenschappelijk onderbouwd, dagelijks bijgewerkt",
    onboarding2Title: "Voeg planten toe in {PRUNE}- snoeien voor advies per plantensoort",
    onboarding2Sub: "Elke categorie krijgt een eigen sproeiadvies",
    onboarding3Title: "Tik op een kalenderdag wanneer je hebt gesproeid",
    onboarding3Sub: "Dit telt mee in de wekelijkse waterbehoefte",
    onboardingLocTitle: "Waar staat jouw tuin?",
    onboardingLocSub: "We gebruiken je locatie voor dagelijkse regen- en weersverwachtingen. Je kunt dit altijd aanpassen in het tabblad Instellingen.",
    onboardingShareLocation: "Deel mijn locatie",
    onboarding4Title: "Ontvang elke ochtend een seintje als sproeien nodig is",
    onboarding4Sub: "Alleen gestuurd als je tuin het echt nodig heeft",
    onboardingAllow: "Meldingen toestaan",
    onboardingSkipNow: "Nu overslaan",

    // Info sheets (item 5)
    infoRainfallTitle: "Neerslagoverzicht",
    infoRainfallBody: "Afgelopen 7 dagen toont gemeten neerslag op jouw locatie. Komende 3 dagen toont de weersvoorspelling van OpenWeather. Samen bepalen ze of je tuin extra water nodig heeft deze week.",
    infoRecTitle: "Hoe werkt dit?",
    infoRecBody: "We berekenen hoeveel water je tuin dagelijks verliest door verdamping, op basis van temperatuur en jouw breedtegraad (ET₀). Als regen en gesproeid water de weekbehoefte niet dekken, raden we aan bij te sproeien.\n\nHet advies wordt per plantcategorie weergegeven, op basis van de planten die je in het Snoeien-tabblad hebt toegevoegd. Elke categorie (bijv. bomen, struiken, gazon) heeft zijn eigen waterbehoeften.",

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

// Lookup maps for plant API enum values (Perenual).
// Keys are lowercase to allow case-insensitive matching.
const plantValueMaps = {
  cycle: {
    en: {
      perennial: "Perennial",
      annual: "Annual",
      biennial: "Biennial",
      "herbaceous perennial": "Herbaceous Perennial",
      evergreen: "Evergreen",
      deciduous: "Deciduous",
      vine: "Vine",
      shrub: "Shrub",
      bulb: "Bulb",
    },
    nl: {
      perennial: "Vaste plant",
      annual: "Eenjarig",
      biennial: "Tweejarig",
      "herbaceous perennial": "Kruidachtige vaste plant",
      evergreen: "Groenblijvend",
      deciduous: "Bladverliezend",
      vine: "Klimplant",
      shrub: "Struik",
      bulb: "Bol",
    },
  },
  maintenance: {
    en: {
      low: "Low",
      moderate: "Moderate",
      medium: "Medium",
      high: "High",
      minimum: "Minimum",
    },
    nl: {
      low: "Laag",
      moderate: "Matig",
      medium: "Gemiddeld",
      high: "Hoog",
      minimum: "Minimaal",
    },
  },
  sunlight: {
    en: {
      "full sun": "Full Sun",
      "part shade": "Part Shade",
      "partial shade": "Partial Shade",
      "full shade": "Full Shade",
      "sun/part shade": "Sun / Part Shade",
      "sun-part shade": "Sun / Part Shade",
      "filtered shade": "Filtered Shade",
      "deep shade": "Deep Shade",
    },
    nl: {
      "full sun": "Volle zon",
      "part shade": "Halfschaduw",
      "partial shade": "Deelschaduw",
      "full shade": "Volledige schaduw",
      "sun/part shade": "Zon / Halfschaduw",
      "sun-part shade": "Zon / Halfschaduw",
      "filtered shade": "Gefilterde schaduw",
      "deep shade": "Diepe schaduw",
    },
  },
};

/**
 * Translate a plant API enum value (cycle, maintenance, sunlight).
 * Falls back to the original value if no translation is found.
 */
export function translatePlantValue(lang, field, value) {
  if (!value) return value;
  const map = plantValueMaps[field]?.[lang] ?? plantValueMaps[field]?.en;
  if (!map) return value;
  return map[value.toLowerCase()] ?? value;
}
