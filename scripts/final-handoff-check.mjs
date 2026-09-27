import { chromium, expect } from '@playwright/test';
const browser=await chromium.launch({channel:'msedge',headless:true});
const page=await browser.newPage({viewport:{width:1440,height:900}});page.setDefaultTimeout(10000);
try {
 await page.goto('http://127.0.0.1:5173/#/planning');
 await page.getByLabel('Target operating horizon (months)',{exact:true}).fill('8');
 for(const label of ['Maximum traffic reduction','Maximum load reduction','Maximum cooling adjustment']){const slider=page.getByRole('slider',{name:label});await slider.fill('0');await slider.dispatchEvent('input');}
 await page.getByRole('button',{name:'Find a feasible plan'}).click();
 await page.getByRole('link',{name:'Review repair',exact:false}).click();
 await expect(page.getByRole('heading',{name:'Repair · Intervention preview',exact:true})).toBeVisible();
 const state=await page.evaluate(()=>JSON.parse(localStorage.getItem('elevai-twin:v1')).state);
 expect(state.twin.revision).toBe(42);expect(state.events[0].type).toBe('INTERVENTION_PREVIEWED');
 await page.keyboard.press('Escape');
 await page.goto('http://127.0.0.1:5173/#/assistant');
 await expect(page.getByText('Connect your cloud AI',{exact:true})).toBeVisible();
 await page.screenshot({path:'artifacts/assistant-v2.png',fullPage:true});
 console.log('PASS: recommended repair preview opened, state unchanged, event logged; real AI setup state captured.');
}finally{await browser.close();}
