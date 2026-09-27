import { chromium, expect } from '@playwright/test';
import { readFile, mkdir } from 'node:fs/promises';
const browser=await chromium.launch({channel:'msedge',headless:true});
try{
  const context=await browser.newContext({viewport:{width:1440,height:1000}}),page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  const backup=JSON.parse(await readFile('artifacts/manual/test-backup.json','utf8'));
  // Legacy records produced by the existing browser test: no new optional fields.
  const record=backup.elevators[0];backup.selectedId=record.id;
  const before=JSON.stringify(record.readings),beforeModel=JSON.stringify(record.model);
  await page.goto('http://127.0.0.1:5174/');
  await page.evaluate(data=>localStorage.setItem('elevai-manual-registry:v1',JSON.stringify(data)),backup);await page.reload();
  await expect(page.getByRole('heading',{name:'Operational usage',exact:true})).toBeVisible();
  await page.getByRole('link',{name:'Digital Twin',exact:true}).click();
  await expect(page.getByText('2 consecutive comparable periods',{exact:false})).toBeVisible();
  await expect(page.locator('.usage-trends').getByText('Relatively stable',{exact:true})).toHaveCount(2);
  await page.getByText('Usage formulas and analysis settings',{exact:true}).click();
  await page.getByLabel('Usage stability tolerance (%)').fill('2');
  await page.getByRole('button',{name:'Save usage analysis settings',exact:true}).click();
  await expect(page.getByRole('status')).toContainText('Raw measurements and experimental formulas are unchanged');
  await page.reload();await page.getByText('Usage formulas and analysis settings',{exact:true}).click();
  await expect(page.getByLabel('Usage stability tolerance (%)')).toHaveValue('2');
  let stored=await page.evaluate(()=>JSON.parse(localStorage.getItem('elevai-manual-registry:v1')));
  if(JSON.stringify(stored.elevators[0].readings)!==before||JSON.stringify(stored.elevators[0].model)!==beforeModel)throw Error('Usage settings changed existing data');
  if(stored.elevators[1].usageSettings)throw Error('Settings leaked to another elevator');
  await page.getByRole('button',{name:'Add measurement period +',exact:true}).click();
  const last=record.readings.at(-1);
  for(const k of ['motorAgeYears','operatingHours','totalCycles','periodOperatingHours','periodCycles','averageLoadPct','windingTemperatureC','bearingTemperatureC','vibrationRms','currentA','ratedCurrentA','voltageV','ratedVoltageV','faultEvents'])await page.locator(`[name="${k}"]`).fill(String(last[k]));
  await page.locator('[name="operatingHours"]').fill(String(last.operatingHours+12));
  await page.locator('[name="totalCycles"]').fill(String(last.totalCycles+840));
  await page.locator('[name="periodOperatingHours"]').fill('12');await page.locator('[name="periodCycles"]').fill('840');
  await page.locator('[name="start"]').fill('2026-09-21T00:00');await page.locator('[name="end"]').fill('2026-09-23T00:00');
  await page.getByText('Optional starting counters · reconcile this interval',{exact:true}).click();
  await page.locator('[name="startOperatingHours"]').fill(String(last.operatingHours));
  await page.locator('[name="startTotalCycles"]').fill(String(last.totalCycles-10));
  await page.getByRole('button',{name:'Save measurement period',exact:true}).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByText('Neither value has been changed.',{exact:false})).toBeVisible();
  await expect(page.getByText("Entered starting cycles do not match",{exact:false})).toBeVisible();
  stored=await page.evaluate(()=>JSON.parse(localStorage.getItem('elevai-manual-registry:v1')));
  if(stored.elevators[0].readings.at(-1).startTotalCycles!==last.totalCycles-10)throw Error('Counter mismatch was silently corrected');
  await mkdir('artifacts/usage',{recursive:true});await page.screenshot({path:'artifacts/usage/quality-desktop.png',fullPage:true});
  await page.setViewportSize({width:390,height:844});
  // Responsive charts/canvas resize asynchronously after the viewport changes.
  await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth-innerWidth),{message:'Usage page must fit the mobile viewport after responsive layout settles'}).toBeLessThanOrEqual(1);
  await page.screenshot({path:'artifacts/usage/quality-mobile.png',fullPage:true});
  // Existing optional sample autofill is still available, and sample trends are excluded.
  await page.getByRole('button',{name:'All elevators',exact:true}).click();await page.getByRole('button',{name:'Add elevator',exact:true}).click();await page.getByRole('button',{name:'Autofill sample values',exact:true}).click();await page.getByRole('button',{name:'Create elevator & open dashboard',exact:true}).click();
  await expect(page.getByText('Generated demo data',{exact:true})).toBeVisible();await expect(page.locator('.usage-trends').getByText('Insufficient history',{exact:true})).toHaveCount(2);
  if(errors.length)throw Error(errors.join('\n'));
  console.log('PASS: legacy records, normalized usage, persisted independent settings, optional start counters, mismatch retention/display, unchanged model/raw history, sample exclusion and mobile quality panel.');
}finally{await browser.close();}
