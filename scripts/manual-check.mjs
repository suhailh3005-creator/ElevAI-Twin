import { chromium, expect } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
const browser=await chromium.launch({channel:'msedge',headless:true});
const context=await browser.newContext({viewport:{width:1440,height:1000}});
const page=await context.newPage();page.setDefaultTimeout(12000);const errors=[];
page.on('pageerror',e=>errors.push(e.message));
const base='http://127.0.0.1:5174/';
const values={motorAgeYears:5,operatingHours:10000,totalCycles:500000,periodOperatingHours:60,periodCycles:4200,averageLoadPct:55,windingTemperatureC:70,bearingTemperatureC:60,vibrationRms:4,currentA:18,ratedCurrentA:18,voltageV:400,ratedVoltageV:400,faultEvents:0};
async function fillReading(extra={}){for(const [k,v]of Object.entries({...values,...extra}))await page.locator(`[name="${k}"]`).fill(String(v));await page.locator('[name="start"]').fill('2026-09-01T00:00');await page.locator('[name="end"]').fill('2026-09-11T00:00');}
async function add(name,extra={}){await page.getByRole('button',{name:'Add elevator',exact:true}).click();await page.locator('[name="project"]').fill('Browser test project');await page.locator('[name="name"]').fill(name);await fillReading(extra);await page.getByRole('button',{name:'Create elevator & open dashboard'}).click();await expect(page.getByRole('heading',{name,exact:true})).toBeVisible();}
try{
 await mkdir('artifacts/manual',{recursive:true});await page.goto(base);
 await expect(page.getByRole('heading',{name:'Elevator registry',exact:true})).toBeVisible();
 await expect(page.getByText('Your first elevator starts here.')).toBeVisible();
 await page.screenshot({path:'artifacts/manual/registry-empty.png',fullPage:true});
 await add('TEST A');
 await expect(page.getByText('63%',{exact:true})).toHaveCount(0);
 await page.screenshot({path:'artifacts/manual/dashboard.png',fullPage:true});
 let db=await page.evaluate(()=>JSON.parse(localStorage.getItem('elevai-manual-registry:v1')));const aid=db.selectedId;
 await page.reload();await expect(page.getByRole('heading',{name:'TEST A',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'All elevators'}).click();await add('TEST B',{windingTemperatureC:110,bearingTemperatureC:90,vibrationRms:9});
 db=await page.evaluate(()=>JSON.parse(localStorage.getItem('elevai-manual-registry:v1')));const bid=db.selectedId;
 if(db.elevators.length!==2||db.elevators.find(e=>e.id===aid).readings[0].windingTemperatureC!==70)throw Error('Elevator isolation failed');
 await page.getByRole('button',{name:'All elevators'}).click();await page.locator('.elevator-card').filter({has:page.getByRole('heading',{name:'TEST A',exact:true})}).getByRole('button',{name:'Open elevator'}).click();
 await page.getByRole('link',{name:'Digital Twin',exact:true}).click();await expect(page.getByText('One period recorded.',{exact:false})).toBeVisible();
 await page.getByRole('button',{name:'Add measurement period +',exact:true}).click();await fillReading({motorAgeYears:5.1,operatingHours:10060,totalCycles:504200});await page.getByRole('button',{name:'Save measurement period'}).click();await expect(page.getByRole('alert')).toContainText('previous period ends');
 await page.locator('[name="start"]').fill('2026-09-11T00:00');await page.locator('[name="end"]').fill('2026-09-21T00:00');await page.getByRole('button',{name:'Save measurement period'}).click();await expect(page.getByRole('dialog')).toHaveCount(0);
 db=await page.evaluate(()=>JSON.parse(localStorage.getItem('elevai-manual-registry:v1')));if(db.elevators.find(e=>e.id===aid).readings.length!==2||db.elevators.find(e=>e.id===bid).readings.length!==1)throw Error('Reading isolation failed');
 await page.getByRole('link',{name:'Evidence',exact:true}).click();await page.getByLabel('Initial degradation formula').fill('0.2');await page.getByLabel('Daily degradation-rate formula').fill('0.001');await page.getByLabel('Intervention threshold').fill('0.5');await page.getByRole('button',{name:'Save formulas for this elevator'}).click();await expect(page.getByRole('status')).toContainText('Formulas saved');
 await page.getByRole('link',{name:'Overview',exact:true}).click();await expect(page.locator('.metric').filter({hasText:'Estimated motor health'}).locator('.metric-number')).toContainText('80');await expect(page.locator('.metric').filter({hasText:'Time to threshold'}).locator('.metric-number')).toContainText('300');
 await page.getByRole('link',{name:'Decision Engine',exact:true}).click();for(const [k,v]of Object.entries({name:'Test service',cost:10000,downtime:5,degradation:.1,rate:.0005,source:'Test assumptions'}))await page.locator(`[name="${k}"]`).fill(String(v));await page.getByRole('button',{name:'Save comparison option'}).click();await expect(page.getByRole('heading',{name:'Test service',exact:true})).toBeVisible();
 await page.getByRole('link',{name:'Response Planner',exact:true}).click();await page.getByLabel('Days from the latest').fill('500');await page.getByLabel('Maximum intervention budget').fill('15000');await page.getByLabel('Maximum downtime').fill('8');await page.getByRole('button',{name:'Find a feasible plan',exact:true}).click();await expect(page.getByRole('heading',{name:'Test service',exact:true})).toBeVisible();await page.getByRole('button',{name:'Compare intervention replay'}).click();await expect(page.getByRole('heading',{name:'Estimated motor health',exact:true})).toBeVisible();
 await page.getByRole('tab',{name:'Maintenance windows'}).click();await page.getByLabel('Earliest date').fill('2026-09-25');await page.getByLabel('Complete by').fill('2026-10-05');await page.getByLabel('Budget (₹)',{exact:true}).fill('15000');for(const name of ['Mon','Tue','Wed','Thu','Fri'])await page.getByLabel(name,{exact:true}).check();await page.getByRole('button',{name:'Find maintenance windows',exact:true}).click();await page.getByRole('button',{name:'Save local plan',exact:true}).first().click();await expect(page.getByRole('status')).toContainText('Saved to this elevator');
 await page.getByRole('link',{name:'Investigation',exact:true}).click();await page.getByLabel('Winding temperature maximum').fill('65');await page.getByRole('button',{name:'Save monitoring limits'}).click();await expect(page.getByRole('cell',{name:'Above entered limit',exact:true})).toHaveCount(1);
 await page.getByRole('link',{name:'Scenario Lab',exact:true}).click();await page.getByLabel('Winding temperature (°C)').fill('100');db=await page.evaluate(()=>JSON.parse(localStorage.getItem('elevai-manual-registry:v1')));if(db.elevators.find(e=>e.id===aid).readings.at(-1).windingTemperatureC!==70)throw Error('Scenario overwrote measured record');
 await page.route('**/api/ai-status',route=>route.fulfill({json:{configured:true,model:'test-model'}}));let aiPayload;
 await page.route('**/api/manual-assistant',async route=>{aiPayload=route.request().postDataJSON();await route.fulfill({json:{reply:'Test response from isolated snapshot.'}});});
 await page.getByRole('link',{name:'AI Assistant',exact:true}).click();await page.getByLabel('Question',{exact:true}).fill('Explain my readings');await page.getByRole('button',{name:'Ask AI',exact:true}).click();await expect(page.getByText('Test response from isolated snapshot.')).toBeVisible();if(aiPayload.elevator.id!==aid||JSON.stringify(aiPayload).includes('TEST B'))throw Error('Wrong AI context');
 await page.getByRole('button',{name:'All elevators'}).click();await page.locator('.elevator-card').filter({has:page.getByRole('heading',{name:'TEST B',exact:true})}).getByRole('button',{name:'Open elevator'}).click();db=await page.evaluate(()=>JSON.parse(localStorage.getItem('elevai-manual-registry:v1')));const b=db.elevators.find(e=>e.id===bid);if(b.plans.length||b.interventions.length||b.model.degradationExpression==='0.2')throw Error('Options/model leaked to B');
 await page.setViewportSize({width:390,height:844});
 for(const name of ['Overview','Digital Twin','Prognostics','Scenario Lab','Decision Engine','Evidence','Investigation','Response Planner','AI Assistant']){await page.getByRole('link',{name,exact:true}).click();await page.locator('h1').waitFor();if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1))throw Error(`Mobile overflow: ${name}`);}
 await page.getByRole('link',{name:'Overview',exact:true}).click();await page.screenshot({path:'artifacts/manual/dashboard-mobile.png',fullPage:true});
 await page.getByRole('button',{name:'All elevators'}).click();await page.setViewportSize({width:1440,height:1000});await page.screenshot({path:'artifacts/manual/registry-populated.png',fullPage:true});
 const downloadPromise=page.waitForEvent('download');await page.getByRole('button',{name:'Export backup'}).click();const download=await downloadPromise;await download.saveAs('artifacts/manual/test-backup.json');
 const fresh=await browser.newPage();await fresh.goto(base);await fresh.locator('input[type=file]').setInputFiles('artifacts/manual/test-backup.json');await expect(fresh.locator('.elevator-card')).toHaveCount(2);await fresh.close();
 if(errors.length)throw Error(errors.join('\n'));
 console.log('PASS: blank start; create/switch/persist 2 isolated elevators; validate/add periods; custom formulas; intervention/target/replay/schedule; limits; scenario isolation; selected-only AI context; backup restore; all pages at mobile width; no browser errors.');
}finally{await browser.close();}
