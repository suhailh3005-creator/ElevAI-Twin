import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
const browser=await chromium.launch({channel:'msedge',headless:true});
const page=await browser.newPage({viewport:{width:1440,height:900}});
page.setDefaultTimeout(10000); const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text())});
await page.goto('http://127.0.0.1:5173/');
await page.getByRole('heading',{name:'Elevator EL-204',exact:true}).waitFor();
await mkdir('artifacts',{recursive:true});
await page.screenshot({path:'artifacts/overview-1440.png',fullPage:true});
await page.getByRole('link',{name:'Scenario Lab'}).click();
const traffic=page.getByRole('slider',{name:'Traffic change'});await traffic.fill('40');await traffic.dispatchEvent('input');
await page.getByRole('cell',{name:'588',exact:true}).waitFor();
await page.getByRole('button',{name:'Save scenario',exact:true}).click();
await page.getByRole('button',{name:'Load',exact:true}).waitFor();
await page.screenshot({path:'artifacts/scenario-1440.png',fullPage:true});
await page.getByRole('link',{name:'Decision Engine'}).click();
await page.getByRole('heading',{name:'Replace minimizes the weighted decision score.'}).waitFor();
await page.locator('section.option').filter({has:page.getByRole('heading',{name:'Replace',exact:true})}).getByRole('button').click();
await page.getByRole('cell',{name:'96%',exact:true}).waitFor();
await page.getByRole('button',{name:'Apply to digital twin'}).click();
await page.getByRole('heading',{name:'Intervention applied'}).waitFor();
await page.screenshot({path:'artifacts/intervention-1440.png',fullPage:true});
await page.getByRole('link',{name:'Return to Overview'}).click();
await page.reload();
let persisted=await page.evaluate(()=>JSON.parse(localStorage.getItem('elevai-twin:v1')).state);
if(persisted.twin.revision!==43||persisted.twin.degradation!==.04||!persisted.events.some(e=>e.type==='INTERVENTION_APPLIED'))throw Error('Intervention persistence failed');
console.log('Persistence passed'); for(const name of ['Digital Twin','Prognostics','Evidence']){await page.getByRole('link',{name}).click();await page.locator('h1').waitFor();}
console.log('Reset check'); await page.getByRole('button',{name:'Reset Demo'}).click();await page.getByRole('button',{name:'Reset prototype',exact:true}).click();
persisted=await page.evaluate(()=>JSON.parse(localStorage.getItem('elevai-twin:v1')).state);if(persisted.twin.revision!==42||persisted.saved.length)throw Error('Reset failed');
await page.setViewportSize({width:1366,height:768});await page.screenshot({path:'artifacts/overview-1366.png',fullPage:true});
for(const size of [{width:1920,height:1080},{width:390,height:844}]){await page.setViewportSize(size);if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1))throw Error(`Overflow at ${size.width}`);}
await page.setViewportSize({width:1440,height:900}); await page.evaluate(()=>localStorage.setItem('elevai-twin:v1','{malformed'));await page.reload();await page.getByRole('alert').waitFor();
console.log('Reset check'); await page.getByRole('button',{name:'Reset Demo'}).click();await page.getByRole('button',{name:'Reset prototype',exact:true}).click();
await page.getByRole('link',{name:'Digital Twin'}).click(); await page.getByRole('button',{name:'View raw state'}).click(); await page.getByRole('heading',{name:'Actual persisted TwinState'}).waitFor(); await page.keyboard.press('Escape'); await page.getByRole('button',{name:'Receive simulated snapshot'}).click(); await page.getByRole('heading',{name:'Traction motor',exact:true}).waitFor(); await page.getByRole('link',{name:'Decision Engine'}).click(); await page.getByLabel('Enforce residual risk limit').uncheck(); const cost=page.getByRole('slider',{name:'Cost weight',exact:true}); await cost.fill('100'); await cost.dispatchEvent('input'); await page.getByRole('heading',{name:'Repair minimizes the weighted decision score.'}).waitFor(); await page.getByRole('link',{name:'Overview'}).click(); await page.getByRole('button',{name:'Inspect Doors'}).click(); await page.getByRole('heading',{name:'Doors · Architecture context'}).waitFor(); await page.keyboard.press('Escape'); await page.keyboard.press('Shift+R'); await page.getByRole('button',{name:'Reset prototype',exact:true}).click(); if(errors.length)throw Error(errors.join('\n'));
console.log('PASS: navigation, +40% traffic, scenario save, intervention preview/apply, refresh persistence, reset, recovery, responsive overflow and no browser exceptions.');
await browser.close();




