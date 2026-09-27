import { chromium, expect } from '@playwright/test';
import { mkdir } from 'node:fs/promises';

const browser = await chromium.launch({ channel: 'msedge', headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, timezoneId: 'Asia/Kolkata' });
page.setDefaultTimeout(12_000);
const errors = [];
page.on('pageerror', error => errors.push(error.message));
const twinState = () => page.evaluate(() => JSON.parse(localStorage.getItem('elevai-twin:v1')).state);
const planningState = () => page.evaluate(() => JSON.parse(localStorage.getItem('elevai-planning:v1')).state);
const search = () => page.getByRole('button', { name: 'Find a feasible plan' }).click();
const navigate = name => page.getByRole('link', { name, exact: false }).first().click();

try {
  await page.goto('http://127.0.0.1:5173/#/planning');
  await expect(page.getByRole('heading', { name: 'Response Planner', exact: true })).toBeVisible();
  await page.getByLabel('Target operating horizon (months)').fill('8');
  await search();
  await expect(page.getByRole('heading', { name: 'Operating changes can meet the modeled target.' })).toBeVisible();
  await mkdir('artifacts', { recursive: true });
  await page.evaluate(() => window.scrollTo(0, 0)); await page.screenshot({ path: 'artifacts/planner-v2.png', fullPage: true });
  const first = (await twinState()).events.find(event => event.type === 'TARGET_PLAN_SEARCHED').metadata.recommendation;
  expect(first.action).toBe('None');
  expect(first.rulMonths).toBeGreaterThanOrEqual(8);
  expect(first.scenario.horizon).toBe(12);
  await expect(page.getByRole('button', { name: 'Compare intervention replay' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Load operating scenario' }).click();
  expect((await twinState()).scenario).toEqual(first.scenario);
  expect((await twinState()).twin.revision).toBe(42);
  await page.getByRole('link', { name: 'View operating forecast' }).click();
  await expect(page.getByLabel('Forecast horizon')).toHaveValue('12');

  await navigate('Response Planner');
  await page.getByLabel('Target operating horizon (months)').fill('15');
  await page.getByLabel('Intervention budget (₹)').fill('200000');
  await page.getByLabel('Max downtime (hours)').fill('24');
  for (const name of ['Maximum traffic reduction', 'Maximum load reduction', 'Maximum cooling adjustment']) {
    await page.getByRole('slider', { name }).fill('0');
  }
  await search();
  await expect(page.getByRole('heading', { name: 'Replace plus these conditions meets the modeled target.' })).toBeVisible();
  const replacement = (await twinState()).events.find(event => event.type === 'TARGET_PLAN_SEARCHED').metadata.recommendation;
  await page.getByRole('button', { name: 'Compare intervention replay' }).click();
  expect((await twinState()).scenario).toEqual(replacement.scenario);
  expect((await twinState()).twin.revision).toBe(42);
  expect((await planningState()).replay.action).toBe('Replace');
  await expect(page.getByRole('combobox', { name: 'Intervention', exact: true })).toHaveValue('Replace');
  await page.getByLabel('Apply intervention after (months)').fill('9');
  await expect(page.getByText('The proposed intervention arrives too late.', { exact: true })).toBeVisible();
  await page.getByLabel('Apply intervention after (months)').fill('18');
  await expect(page.getByText('Intervention is outside the replay horizon.', { exact: true })).toBeVisible();
  const costRow = page.getByRole('row').filter({ hasText: 'Scheduled intervention cost' });
  await expect(costRow.locator('td').last()).toHaveText('₹0');
  await page.getByLabel('Apply intervention after (months)').fill('1');
  await mkdir('artifacts', { recursive: true });
  await page.evaluate(() => window.scrollTo(0, 0)); await page.screenshot({ path: 'artifacts/planning-replay-desktop.png', fullPage: true });

  await page.getByRole('tab', { name: 'What would it take?' }).click();
  await page.getByLabel('Target operating horizon (months)').fill('60');
  await page.getByLabel('Intervention budget (₹)').fill('0');
  await expect(page.getByText('Inputs or twin state changed', { exact: true })).toBeVisible();
  await search();
  await expect(page.getByRole('heading', { name: 'The engine cannot meet every constraint.' })).toBeVisible();
  await page.evaluate(() => window.scrollTo(0, 0)); await page.screenshot({ path: 'artifacts/planning-infeasible-desktop.png', fullPage: true });

  await page.getByRole('tab', { name: 'Maintenance windows' }).click();
  await page.getByRole('combobox', { name: 'Intervention', exact: true }).selectOption('Replace');
  await page.getByLabel('Intervention budget (₹)').fill('200000');
  await page.getByRole('button', { name: 'Find maintenance windows' }).click();
  await expect(page.getByRole('heading', { name: 'No feasible window', exact: true })).toBeVisible();
  await page.getByRole('combobox', { name: 'Intervention', exact: true }).selectOption('Repair');
  await page.getByRole('button', { name: 'Find maintenance windows' }).click();
  await expect(page.getByRole('heading', { name: 'Best available windows' })).toBeVisible();
  await page.getByRole('button', { name: 'Save local plan', exact: true }).first().click();
  const saved = (await planningState()).savedWindows;
  expect(saved).toHaveLength(1);
  // The browser is explicitly in IST: the planner must offer local full-hour starts.
  expect(await page.evaluate(iso => new Date(iso).getMinutes(), saved[0].start)).toBe(0);
  expect((await twinState()).events.some(event => event.type === 'MAINTENANCE_PLAN_SAVED')).toBeTruthy();
  await page.reload();
  await page.getByRole('tab', { name: 'Maintenance windows' }).click();
  await expect(page.locator('.saved-row')).toHaveCount(1);
  expect((await planningState()).savedWindows[0].id).toBe(saved[0].id);
  await page.getByRole('button', { name: 'Find maintenance windows' }).click();
  await page.evaluate(() => window.scrollTo(0, 0)); await page.screenshot({ path: 'artifacts/planning-schedule-desktop.png', fullPage: true });

  for (const width of [1440, 1366, 900, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    for (const tab of ['What would it take?', 'Intervention replay', 'Maintenance windows']) {
      await page.getByRole('tab', { name: tab }).click();
      if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)) console.log(await page.evaluate(() => [...document.querySelectorAll('main *')].filter(el => el.getBoundingClientRect().right > innerWidth + 1).map(el => ({tag:el.tagName, cls:el.className, text:el.textContent.slice(0,80), right:el.getBoundingClientRect().right})).slice(0,20)));
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${tab} overflow at ${width}px`).toBeTruthy();
    }
    if (width === 390) await page.evaluate(() => window.scrollTo(0, 0)); await page.screenshot({ path: 'artifacts/planning-schedule-mobile.png', fullPage: true });
  }
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.getByRole('button', { name: 'Reset Demo' }).click();
  await page.getByRole('button', { name: 'Reset prototype', exact: true }).click();
  expect((await planningState()).savedWindows).toHaveLength(0);
  expect((await planningState()).constraints.targetMonths).toBe(9);
  expect((await twinState()).twin.revision).toBe(42);
  await page.reload();
  expect((await planningState()).savedWindows).toHaveLength(0);
  expect(errors).toEqual([]);
  console.log('PASS: feasible and infeasible targets, zero-action handoff, shared scenario and intervention replay, delayed/out-of-horizon actions, IST scheduling, persistent local plans, reset, five responsive widths, and no browser runtime errors.');
} finally { await browser.close(); }
