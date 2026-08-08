---
description: Launch and screenshot the garden watering app in a browser
---

# Run skill: garden-watering-app

## How to launch and screenshot the app

**Stack**: Vite dev server (React SPA) + Playwright Chromium for screenshots.

### Step 1 — start the dev server (background)
```bash
npm run dev &
sleep 3
```
Server runs on http://localhost:5173.

### Step 2 — write and run a Playwright script FROM THE PROJECT DIRECTORY

IMPORTANT: run `node screenshot.mjs` from `/Users/qcorver/garden-watering-app/` so that Playwright resolves from `node_modules/playwright` in the project. Running from `/tmp` fails with ERR_MODULE_NOT_FOUND.

```js
// screenshot.mjs  (written to project root, deleted after use)
import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
await page.setViewportSize({ width: 390, height: 844 }); // iPhone size

// Skip onboarding + set a location BEFORE the page loads
await page.addInitScript(() => {
  localStorage.setItem('onboardingDone', '1');
  localStorage.setItem('selectedLocation', 'Amsterdam,NL');
});

await page.goto('http://localhost:5173');
await page.waitForLoadState('networkidle');
await page.waitForTimeout(1500);

// Navigate to the desired tab by index:
// 0 = Watering, 1 = Calendar, 2 = My Garden, 3 = Settings
await page.locator('.tab-bar-button').nth(2).click();
await page.waitForTimeout(800);

await page.screenshot({ path: '/tmp/screenshot.png' });
await browser.close();
console.log('done');
```

```bash
node screenshot.mjs
rm screenshot.mjs          # clean up
```

### Step 3 — display the screenshot
```
Read /tmp/screenshot.png
```

### Cleanup
```bash
kill %1   # stop dev server
```

## Key gotchas
- **Onboarding blocks everything**: always use `addInitScript` to set `onboardingDone` and `selectedLocation` in localStorage before `goto`.
- **Run from project root**: Playwright must resolve from `node_modules/` in the project directory.
- **Tab indices**: 0=Watering, 1=Calendar, 2=My Garden (🪴), 3=Settings.
- **Viewport**: 390×844 matches iPhone 14 — the app is designed for mobile.
