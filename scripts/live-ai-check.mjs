import { chromium, expect } from '@playwright/test';
const browser = await chromium.launch({channel:'msedge',headless:true});
const page = await browser.newPage({viewport:{width:1440,height:900}});
page.setDefaultTimeout(70000);
// This fresh browser context has no user storage. Refuse to transmit anything
// other than the official synthetic seed (src/data/seed.ts), with no notes/history.
const syntheticSeed={assetId:'EL-204',component:'traction_motor',revision:42,degradation:.37,ageYears:8.4,totalCycles:1284310,dailyCycles:420,operatingHours:18422,averageLoadPct:55,temperatureC:76.4,vibrationRms:5.6,currentA:19.8,faultEvents30d:3,efficiencyImprovementPct:0};
await page.route('**/api/assistant',async route=>{
  const body=route.request().postDataJSON(),c=body?.context;
  const isSeed=c?.twin && Object.keys(c.twin).length===Object.keys(syntheticSeed).length+1 && Object.entries(syntheticSeed).every(([k,v])=>c.twin[k]===v);
  const safe=isSeed && c.notes==='' && !c.investigation && body.messages?.length===1 && c.recentEvents?.every(e=>e.type==='TWIN_INITIALIZED' && e.title==='Traction motor twin initialized' && Object.keys(e.metadata||{}).length===0);
  if(!safe){await route.abort();throw new Error('Live check blocked: payload was not the official synthetic seed.');}
  console.log('Verified: official synthetic seed only; no notes, past chat or real equipment data.');
  await route.continue();
});
try {
  await page.goto('http://127.0.0.1:5173/#/assistant');
  await expect(page.getByText('OpenAI · gpt-5-mini',{exact:true})).toBeVisible();
  await page.getByLabel('Ask the engineering copilot',{exact:true}).fill('Briefly explain the current motor health, 90-day risk and median RUL using the supplied evidence. Then prepare planning inputs for a target of 6 months, budget INR 45000 and maximum downtime 5 hours; do not claim feasibility until the planner searches.');
  await page.getByRole('button',{name:'Send question'}).click();
  const response=page.locator('.assistant-message.assistant');
  await Promise.race([
    response.waitFor({state:'visible'}),
    page.locator('.assistant-alert').waitFor({state:'visible'}).then(async()=>{throw new Error(await page.locator('.assistant-alert').innerText())}),
  ]);
  const reply=await response.innerText();
  await expect(page.getByRole('button',{name:'Review in Target Planner'})).toBeVisible();
  await page.screenshot({path:'artifacts/assistant-live.png',fullPage:true});
  console.log('LIVE OPENAI RESPONSE VERIFIED');
  console.log(reply.slice(0,2500));
} finally {await browser.close();}
