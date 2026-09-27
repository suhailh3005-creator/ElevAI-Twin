import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
try {
  await page.goto('http://127.0.0.1:5173/#/investigation');
  await page.getByRole('button', { name: 'Inject and investigate' }).click();
  await page.getByRole('button', { name: 'Complete trace' }).click();
  await page.getByRole('button', { name: 'Observe simulated inspection' }).click();
  await page.getByRole('button', { name: 'Publish snapshot to twin' }).click();
  await page.getByRole('button', { name: 'Publish snapshot', exact: true }).click();
  await page.reload();
  await page.getByRole('link', { name: 'Plan a response', exact: true }).waitFor();
  await mkdir('artifacts', { recursive: true });
  await page.screenshot({ path: 'artifacts/investigation-1440-reviewed.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: 'artifacts/investigation-390-reviewed.png', fullPage: true });
  const result = await page.evaluate(() => ({ width: innerWidth, scrollWidth: document.documentElement.scrollWidth, overflow: [...document.querySelectorAll('body *')].map(el => { const r = el.getBoundingClientRect(); return { tag: el.tagName, className: el.className?.baseVal ?? el.className, x: Math.round(r.x), right: Math.round(r.right), width: Math.round(r.width), text: el.textContent?.slice(0, 80) }; }).filter(item => item.right > innerWidth + 1 && item.width > 0).slice(0, 30) }));
  console.log(JSON.stringify(result, null, 2));
  if (result.scrollWidth > result.width + 1) throw Error('Investigation mobile overflows');
  await page.locator('.investigation-method summary').click();
  if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)) throw Error('Expanded model card overflows');
  console.log('PASS: published investigation at 1440px and 390px, with expanded model card.');
} finally { await browser.close(); }
