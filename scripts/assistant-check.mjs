import { chromium, expect } from '@playwright/test';

// These checks stub the cloud boundary. They do not make billable provider calls.
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
page.setDefaultTimeout(12_000);
let configured = false;
let responseMode = 'success';
const requests = [];
const errors = [];
page.on('pageerror', error => errors.push(error.message));
await page.route('**/api/ai-status', route => route.fulfill({ json: { configured, provider: 'OpenAI', model: 'mock-model' } }));
await page.route('**/api/assistant', async route => {
  requests.push(route.request().postDataJSON());
  if (responseMode === 'error') return route.fulfill({ status: 429, json: { error: 'Provider rate limit reached. Please retry.' } });
  if (responseMode === 'pending') return;
  return route.fulfill({ json: { reply: 'The stored motor state is simulated. [Twin] The prediction interval comes from 500 trajectories. [Engine] Run the planner to check the proposed constraints.', provider: 'OpenAI', model: 'mock-model', proposal: { targetMonths: 6, budget: 150000, maxDowntimeHours: 12 } } });
});

try {
  await page.goto('http://127.0.0.1:5173/#/assistant');
  await expect(page.getByRole('heading', { name: 'Engineering copilot', exact: true })).toBeVisible();
  await expect(page.getByText('Connect your cloud AI', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Send question' })).toBeDisabled();
  configured = true;
  await page.getByRole('button', { name: 'Check configuration', exact: true }).click();
  await expect(page.getByText('OpenAI · mock-model', { exact: true })).toBeVisible();
  await page.getByLabel('Paste maintenance notes', { exact: true }).fill('Local maintenance note that must be sent only when selected.');
  await page.getByLabel('Ask the engineering copilot', { exact: true }).fill('Explain my risk.');
  await page.getByRole('button', { name: 'Send question' }).click();
  await expect(page.locator('.assistant-message.assistant')).toHaveCount(1);
  expect(requests[0].context.notes).toBe('');
  expect(requests[0].context.twin.revision).toBe(42);
  expect(typeof requests[0].context.model.risk).toBe('number');
  await page.getByLabel('Attach notes to my next question').check();
  await page.getByLabel('Ask the engineering copilot', { exact: true }).fill('Include the selected notes this time.');
  await page.getByRole('button', { name: 'Send question' }).click();
  await expect(page.locator('.assistant-message.assistant')).toHaveCount(2);
  expect(requests[1].context.notes).toContain('Local maintenance note');
  await expect(page.getByLabel('Attach notes to my next question')).not.toBeChecked();
  await page.reload();
  await expect(page.locator('.assistant-message.assistant')).toHaveCount(2);
  await expect(page.getByLabel('Paste maintenance notes', { exact: true })).toHaveValue('');
  await page.getByRole('link', { name: 'Scenario Lab', exact: false }).click();
  const traffic = page.getByRole('slider', { name: 'Traffic change' });
  await traffic.fill('20'); await traffic.dispatchEvent('input');
  await page.getByRole('link', { name: 'AI Assistant', exact: false }).click();
  await expect(page.locator('.assistant-context-notice')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Review in Target Planner' }).first()).toBeDisabled();
  await page.getByLabel('Ask the engineering copilot', { exact: true }).fill('Prepare a fresh proposal.');
  await page.getByRole('button', { name: 'Send question' }).click();
  await expect(page.locator('.assistant-message.assistant')).toHaveCount(3);
  expect(requests[2].messages).toHaveLength(1);
  await page.getByRole('button', { name: 'Review in Target Planner' }).last().click();
  // A mounted planner may immediately consume the proposal from sessionStorage.
  expect(page.url()).toContain('#/planning');
  await page.goto('http://127.0.0.1:5173/#/assistant');
  await page.getByRole('button', { name: 'New conversation' }).click();
  responseMode = 'error';
  await page.getByLabel('Ask the engineering copilot', { exact: true }).fill('Test retry.');
  await page.getByRole('button', { name: 'Send question' }).click();
  await expect(page.getByText('Provider rate limit reached. Please retry.', { exact: true })).toBeVisible();
  responseMode = 'success';
  await page.getByRole('button', { name: 'Retry question' }).click();
  await expect(page.locator('.assistant-message.assistant')).toHaveCount(1);
  await expect(page.locator('.assistant-message.user')).toHaveCount(1);
  responseMode = 'pending';
  await page.getByLabel('Ask the engineering copilot', { exact: true }).fill('Test cancellation.');
  await page.getByRole('button', { name: 'Send question' }).click();
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(page.getByText('Request cancelled.', { exact: false })).toBeVisible();
  await page.evaluate(() => window.dispatchEvent(new Event('elevai-reset')));
  await expect(page.locator('.assistant-message')).toHaveCount(0);
  for (const width of [1440, 900, 390]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBeTruthy();
  }
  expect(errors).toEqual([]);
  console.log('PASS: assistant mock cloud connection, notes consent, engine context, stale snapshot isolation, proposal handoff, persistence, error/retry/cancel, reset and responsive overflow. No live AI calls.');
} finally { await browser.close(); }

