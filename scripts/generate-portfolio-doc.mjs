import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  ImageRun,
  AlignmentType,
  BorderStyle,
  ShadingType,
  Table,
  TableRow,
  TableCell,
  WidthType,
  VerticalAlign,
  convertInchesToTwip,
  ExternalHyperlink,
  UnderlineType,
} from 'docx';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

// ── helpers ──────────────────────────────────────────────────────────────────

function h1(text) {
  return new Paragraph({
    text,
    heading: HeadingLevel.HEADING_1,
    spacing: { before: 400, after: 200 },
  });
}

function h2(text) {
  return new Paragraph({
    text,
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 300, after: 120 },
  });
}

function h3(text) {
  return new Paragraph({
    text,
    heading: HeadingLevel.HEADING_3,
    spacing: { before: 200, after: 80 },
  });
}

function body(text, { bold = false, italic = false, space = 160 } = {}) {
  return new Paragraph({
    children: [new TextRun({ text, bold, italics: italic, size: 22 })],
    spacing: { after: space },
  });
}

function bullet(text, level = 0) {
  return new Paragraph({
    bullet: { level },
    children: [new TextRun({ text, size: 22 })],
    spacing: { after: 80 },
  });
}

function divider() {
  return new Paragraph({
    text: '',
    border: {
      bottom: { style: BorderStyle.SINGLE, size: 6, color: '2D6A2D' },
    },
    spacing: { before: 200, after: 200 },
  });
}

function caption(text) {
  return new Paragraph({
    children: [new TextRun({ text, italics: true, color: '555555', size: 18 })],
    alignment: AlignmentType.CENTER,
    spacing: { after: 240 },
  });
}

function image(imgPath, width, height, altCaption) {
  const buf = fs.readFileSync(imgPath);
  const ext = path.extname(imgPath).toLowerCase().replace('.', '');
  const typeMap = { png: 'png', jpg: 'jpg', jpeg: 'jpg', gif: 'gif', bmp: 'bmp' };
  return [
    new Paragraph({
      children: [new ImageRun({ data: buf, transformation: { width, height }, type: typeMap[ext] || 'png' })],
      alignment: AlignmentType.CENTER,
      spacing: { before: 160, after: 80 },
    }),
    caption(altCaption),
  ];
}

function twoColTable(rows) {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: {
      top: { style: BorderStyle.NONE },
      bottom: { style: BorderStyle.NONE },
      left: { style: BorderStyle.NONE },
      right: { style: BorderStyle.NONE },
      insideH: { style: BorderStyle.NONE },
      insideV: { style: BorderStyle.NONE },
    },
    rows: rows.map(([label, value]) =>
      new TableRow({
        children: [
          new TableCell({
            width: { size: 30, type: WidthType.PERCENTAGE },
            children: [new Paragraph({ children: [new TextRun({ text: label, bold: true, size: 22 })] })],
            verticalAlign: VerticalAlign.TOP,
          }),
          new TableCell({
            width: { size: 70, type: WidthType.PERCENTAGE },
            children: [new Paragraph({ children: [new TextRun({ text: value, size: 22 })] })],
          }),
        ],
      })
    ),
  });
}

// ── document ─────────────────────────────────────────────────────────────────

const screenshotWidth = 155;
const screenshotHeight = 337; // 1206×2622 aspect ratio

const screenshotsDir = path.join(root, 'resources/screenshots');
const screenshotFiles = fs.readdirSync(screenshotsDir)
  .filter(f => f.endsWith('.png'))
  .sort()
  .map(f => path.join(screenshotsDir, f));

const iconPath = path.join(root, 'resources/icon.png');

const doc = new Document({
  creator: 'Quido Corver',
  title: 'When to Water – Mobile App Portfolio',
  description: 'Work sample for Mobile App MVP Development proposal',
  styles: {
    paragraphStyles: [
      {
        id: 'Heading1',
        name: 'Heading 1',
        basedOn: 'Normal',
        next: 'Normal',
        run: { color: '1A5C1A', size: 36, bold: true },
        paragraph: { spacing: { before: 400, after: 200 } },
      },
      {
        id: 'Heading2',
        name: 'Heading 2',
        basedOn: 'Normal',
        next: 'Normal',
        run: { color: '2D6A2D', size: 28, bold: true },
        paragraph: { spacing: { before: 300, after: 120 } },
      },
      {
        id: 'Heading3',
        name: 'Heading 3',
        basedOn: 'Normal',
        next: 'Normal',
        run: { color: '2D6A2D', size: 24, bold: true },
        paragraph: { spacing: { before: 200, after: 80 } },
      },
    ],
  },
  sections: [
    {
      properties: {
        page: {
          margin: {
            top: convertInchesToTwip(1),
            right: convertInchesToTwip(1),
            bottom: convertInchesToTwip(1),
            left: convertInchesToTwip(1),
          },
        },
      },
      children: [

        // ── Title page ──────────────────────────────────────────────────────
        ...image(iconPath, 96, 96, ''),
        new Paragraph({
          children: [new TextRun({ text: 'When to Water', bold: true, size: 52, color: '1A5C1A' })],
          alignment: AlignmentType.CENTER,
          spacing: { after: 120 },
        }),
        new Paragraph({
          children: [new TextRun({ text: 'Smart Garden Watering App — Work Sample', size: 26, color: '555555', italics: true })],
          alignment: AlignmentType.CENTER,
          spacing: { after: 80 },
        }),
        new Paragraph({
          children: [new TextRun({ text: 'Quido Corver  ·  Qcorver@hotmail.com', size: 22, color: '777777' })],
          alignment: AlignmentType.CENTER,
          spacing: { after: 480 },
        }),

        // ── Overview ────────────────────────────────────────────────────────
        h1('Overview'),
        body(
          'When to Water is a cross-platform mobile app (iOS & Android) that tells gardeners exactly when to water their plants — and, importantly, when not to. It combines real-time weather forecasts, 7-day rain history, plant-specific water requirements, soil type, and an evapotranspiration algorithm (Hargreaves-Samani / FAO-56) to give a personalised daily recommendation.'
        ),
        body(
          'The app was designed, built, and shipped from concept to on-device in a matter of weeks — a self-contained MVP that demonstrates the full mobile development lifecycle: product thinking, UX design, full-stack implementation, algorithm development, and app store preparation.'
        ),

        divider(),

        // ── Screenshots ─────────────────────────────────────────────────────
        h1('App Screenshots'),
        // Row 1: screenshots 0 & 1
        new Paragraph({
          children: [
            new ImageRun({ data: fs.readFileSync(screenshotFiles[0]), transformation: { width: screenshotWidth, height: screenshotHeight }, type: 'png' }),
            new TextRun({ text: '    ' }),
            new ImageRun({ data: fs.readFileSync(screenshotFiles[1]), transformation: { width: screenshotWidth, height: screenshotHeight }, type: 'png' }),
          ],
          alignment: AlignmentType.CENTER,
          spacing: { before: 160, after: 80 },
        }),
        caption('Left: Best Day to Water screen.  Right: Calendar view with watering history.'),
        // Row 2: screenshots 2 & 3
        new Paragraph({
          children: [
            new ImageRun({ data: fs.readFileSync(screenshotFiles[2]), transformation: { width: screenshotWidth, height: screenshotHeight }, type: 'png' }),
            new TextRun({ text: '    ' }),
            new ImageRun({ data: fs.readFileSync(screenshotFiles[3]), transformation: { width: screenshotWidth, height: screenshotHeight }, type: 'png' }),
          ],
          alignment: AlignmentType.CENTER,
          spacing: { before: 80, after: 80 },
        }),
        caption('Left: Plant library & pruning planner.  Right: Settings screen.'),

        divider(),

        // ── Key features ────────────────────────────────────────────────────
        h1('Key Features'),

        h2('1. Intelligent Watering Advice'),
        body('The core algorithm integrates multiple data sources to decide whether watering is needed:'),
        bullet('7-day rain history via Open-Meteo (free, no API key required)'),
        bullet('5-day weather forecast via OpenWeather API (proxied through a serverless Edge Function to keep the API key server-side)'),
        bullet('Evapotranspiration (ET₀) computed with the Hargreaves-Samani equation — the weekly water target adapts to actual temperatures and latitude, not just a calendar season factor'),
        bullet('Soil type adjustment (sandy / loamy / clay / chalky) increases or reduces the target by up to 50%'),
        bullet('Sensitivity slider lets the user fine-tune recommendations to their specific microclimate'),
        bullet('"Best day to water" picker finds the start of the longest upcoming dry spell, not just the first dry day — so watering happens before a rain-free stretch'),

        h2('2. Plant Library & Pruning Planner'),
        body('Users build a personal plant library powered by two external APIs and an AI enrichment pipeline:'),
        bullet('Perenual plant database (250,000+ species) for search and base data'),
        bullet('Wikidata for Dutch common names'),
        bullet('iNaturalist for plant photography'),
        bullet('Claude AI (Anthropic) classifies plants into watering categories and extracts pruning months'),
        bullet('Per-plant watering multipliers (vegetables 1.75×, drought-tolerant 0.35×, potted 1.5× with reduced rain efficiency) drive the aggregate recommendation'),
        bullet('Monthly pruning calendar highlights which plants need attention this month'),

        h2('3. Push Notifications'),
        body('A daily cron Edge Function (Supabase / Deno) evaluates conditions for every registered user and sends a personalised push notification via Firebase Cloud Messaging — watering advice in the morning, or a pruning reminder when plants are due.'),

        h2('4. Multi-Language Support'),
        body('The full UI and push notification messages are available in English and Dutch, driven by a lightweight i18n module.'),

        h2('5. Offline Resilience'),
        body('Weather data is cached in localStorage. If the network is unavailable, the app restores the last successful fetch and shows a timestamped offline banner so the user always has a usable recommendation.'),

        divider(),

        // ── Tech stack ──────────────────────────────────────────────────────
        h1('Technical Stack'),
        twoColTable([
          ['Frontend', 'React 19 + Vite (JSX, no router — tab-based navigation)'],
          ['Mobile', 'Capacitor 8 — single codebase compiled to iOS (Xcode) and Android (Gradle)'],
          ['Backend', 'Supabase: Postgres, Row-Level Security, anonymous auth, Edge Functions (Deno/TypeScript)'],
          ['Push', 'Firebase Cloud Messaging (FCM) via Capacitor plugin + daily cron Edge Function'],
          ['Weather data', 'Open-Meteo (historical, free), OpenWeather (forecast, proxied)'],
          ['Plant data', 'Perenual API, Wikidata SPARQL, iNaturalist, Anthropic Claude Haiku (enrichment)'],
          ['Testing', 'Vitest — 53 unit tests covering watering logic, ET₀ algorithm, best-day picker'],
          ['CI/CD', 'Manual: npm run build → npx cap sync → Xcode / Gradle → Firebase App Distribution'],
        ]),

        new Paragraph({ text: '', spacing: { after: 240 } }),
        divider(),

        // ── Architecture ────────────────────────────────────────────────────
        h1('Architecture'),
        body(
          'The app follows a local-first, API-augmented architecture. All watering logic runs on-device (shared TypeScript module imported by both the React frontend and the server-side Edge Function), making the core feature fully offline-capable.'
        ),

        h2('Data Flow'),
        bullet('Weather forecast: React → openWeatherClient.js → weather-proxy Edge Function → OpenWeather API'),
        bullet('Rain history: React → openMeteoClient.js → Open-Meteo (direct, no key needed)'),
        bullet('Push notifications: push-daily Edge Function (cron) → fetches rain data → sends FCM'),
        bullet('Shared algorithm: supabase/functions/_shared/wateringLogic.ts — imported by frontend via Vite path alias and by Edge Function directly'),

        h2('Database (Supabase Postgres)'),
        body('Seven tables, all protected by Row-Level Security policies keyed on auth.uid():'),
        bullet('app_users — anonymous user identities'),
        bullet('user_preferences — language, push enabled'),
        bullet('push_devices — FCM tokens per platform with cascade delete'),
        bullet('user_location — lat/lon for weather and ET₀ lookups'),
        bullet('watering_sessions — historical watering log synced from the calendar'),
        bullet('garden_plants — per-user plant library with watering category and pruning months'),
        bullet('plant_species (shared, public read) — pre-enriched species catalogue seeded from Perenual + Wikidata'),

        divider(),

        // ── UX approach ─────────────────────────────────────────────────────
        h1('UX & Design Approach'),
        body(
          'The app is designed around a single primary question: "Should I water today?" Every screen answers that question faster than opening a weather app and doing the mental arithmetic yourself.'
        ),
        bullet('Dark-green gradient hero headers and Playfair Display serif numerals give the recommendation a premium, at-a-glance quality'),
        bullet('An animated SVG plant illustration reflects the current weather × soil-moisture state across six scenarios (sunny/cloudy/rain × healthy/thirsty) — making the advice emotionally legible at a glance'),
        bullet('iOS safe-area insets (env(safe-area-inset-*)) and font-size ≥ 16 px inputs prevent auto-zoom on focus — standard mobile UX details that matter in production'),
        bullet('Onboarding carousel introduces the app concept before asking for location or notification permissions'),
        bullet('GPS-based location detection with a manual search fallback for users who decline permissions'),

        divider(),

        // ── Delivery ────────────────────────────────────────────────────────
        h1('From Concept to Shipped MVP'),
        body(
          'This project illustrates the full MVP development loop that the job posting describes — starting from a tangible idea, building iteratively, and ending with a testable product on real devices.'
        ),

        h2('Phased Delivery'),
        bullet('Phase 1 — Core algorithm & data: watering logic, weather API integration, unit tests'),
        bullet('Phase 2 — Frontend: React screens, calendar, offline cache, location detection'),
        bullet('Phase 3 — Mobile: Capacitor build, iOS + Android, push notifications via FCM'),
        bullet('Phase 4 — Backend: Supabase database, RLS policies, Edge Functions, cron jobs'),
        bullet('Phase 5 — AI enrichment: plant identification pipeline, Claude API integration, Dutch localisation'),
        bullet('Phase 6 — Polish: UX redesign, SVG illustrations, settings screen, app store assets'),

        h2('Testing'),
        body(
          '53 unit tests (Vitest) cover the watering algorithm, ET₀ computation, the best-day picker, and seasonal boundary conditions. The test suite is the safety net that makes rapid iteration safe — every algorithm change is validated before reaching the device.'
        ),

        divider(),

        // ── Closing ─────────────────────────────────────────────────────────
        h1('Why This Is Relevant to Your Project'),
        body(
          'The job posting asks for someone who can turn a concept into a testable, iterable mobile MVP with solid UX thinking. When to Water is exactly that kind of project:'
        ),
        bullet('Cross-platform mobile (iOS + Android) from a single codebase — no duplicate native work'),
        bullet('Real backend with authentication, a relational database, and serverless functions — not a prototype with mocked data'),
        bullet('External API integrations (weather, plant data, AI) managed cleanly server-side'),
        bullet('Thoughtful UX: the app solves a real problem simply, with accessible design and offline resilience'),
        bullet('Shipped to real devices and tested end-to-end, not just in a simulator'),
        body(
          'I approach every project the same way: understand the concept first, design for the user second, implement cleanly third — and communicate clearly throughout. I am happy to walk you through any part of this codebase on a call.',
          { italic: true }
        ),

        new Paragraph({ text: '' }),
        new Paragraph({
          children: [new TextRun({ text: 'Quido Corver  ·  Qcorver@hotmail.com', size: 22, color: '555555' })],
          alignment: AlignmentType.CENTER,
        }),
      ],
    },
  ],
});

const outPath = path.join(root, 'resources/WhenToWater_Portfolio.docx');
Packer.toBuffer(doc).then((buf) => {
  fs.writeFileSync(outPath, buf);
  console.log('Written to', outPath);
});
