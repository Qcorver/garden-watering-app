import { chromium } from 'playwright';

const browser = await chromium.launch();
const page = await browser.newPage();
await page.setViewportSize({ width: 800, height: 1100 });
await page.goto('file:///Users/qcorver/garden-watering-app/mijn-tuin-mockup.html', { waitUntil: 'networkidle' });
await page.waitForTimeout(1500);
const phone = await page.$('.phone');
await phone.screenshot({ path: 'mijn-tuin-mockup.png' });
await browser.close();
console.log('Saved: mijn-tuin-mockup.png');
