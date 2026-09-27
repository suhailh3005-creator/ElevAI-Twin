import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
const browser=await chromium.launch({channel:'msedge',headless:true});
const page=await browser.newPage({viewport:{width:1440,height:900}});page.setDefaultTimeout(12000);
const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text())});
try {
 await page.goto('http://127.0.0.1:5173/#/investigation');
 await page.getByRole('button',{name:'Inject and investigate'}).click();
 await page.getByRole('button',{name:'Complete trace'}).click();
 await page.getByRole('button',{name:'Observe simulated inspection'}).click();
 await mkdir('artifacts',{recursive:true});await page.screenshot({path:'artifacts/investigation-v2.png',fullPage:true});
 await page.getByRole('button',{name:'Publish snapshot to twin'}).click();
 await page.getByRole('button',{name:'Publish snapshot',exact:true}).click();
 let saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('elevai-twin:v1')).state);
 if(saved.twin.revision!==43||saved.twin.temperatureC<80||!saved.events.some(e=>e.type==='FAULT_INJECTED'))throw Error('Published fault state is invalid');
 await page.reload();await page.getByRole('link',{name:'Plan a response',exact:true}).waitFor();
 await page.setViewportSize({width:1366,height:768});await page.screenshot({path:'artifacts/investigation-1366.png',fullPage:true});
 if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1))throw Error('Desktop overflow');
 await page.setViewportSize({width:390,height:844});if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1))throw Error('Mobile overflow');
 await page.setViewportSize({width:1440,height:900});
 await page.getByRole('button',{name:'Reset Demo'}).click();await page.getByRole('button',{name:'Reset prototype',exact:true}).click();
 await page.getByRole('link',{name:'Investigation',exact:false}).first().click();await page.getByRole('button',{name:'Inject and investigate'}).waitFor();
 if(errors.length)throw Error(errors.join('\n'));
 console.log('PASS: fault injection, evolving trace, inspection evidence, publish, refresh, reset, responsive layout and no browser errors.');
} finally {await browser.close()}
