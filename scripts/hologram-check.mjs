import { chromium,expect } from '@playwright/test';
import { readFile,mkdir } from 'node:fs/promises';
const browser=await chromium.launch({channel:'msedge',headless:true,args:['--enable-unsafe-swiftshader']});
try{
  const context=await browser.newContext({viewport:{width:1500,height:1200}}),page=await context.newPage(),errors=[];
  page.setDefaultTimeout(15000);page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error'&&/THREE|shader|WebGL/i.test(m.text()))errors.push(m.text());});
  await page.addInitScript(()=>{window.__draws=0;for(const type of [WebGLRenderingContext,WebGL2RenderingContext])for(const name of ['drawElements','drawArrays']){const original=type.prototype[name];type.prototype[name]=function(...args){window.__draws++;return original.apply(this,args);};}});
  const backup=JSON.parse(await readFile('artifacts/manual/test-backup.json','utf8'));backup.selectedId=backup.elevators[0].id;
  await page.goto('http://127.0.0.1:5174/');
  await page.evaluate(async data=>{const {randomObservations,inspectionsFromDraft}=await import('/src/manual/inspection/entry.ts');const e=data.elevators[0];e.driveType='geared';e.componentInspections=inspectionsFromDraft(randomObservations('brake',()=>.4),{start:'2026-01-01T00:00:00Z',end:'2026-01-08T00:00:00Z'});e.componentInspections.find(r=>r.componentId==='vfd_drive').values.current_deviation=7;localStorage.setItem('elevai-manual-registry:v1',JSON.stringify(data));},backup);
  await page.reload();await page.getByRole('link',{name:'Digital Twin',exact:true}).click();
  const panel=page.locator('.twin3d'),canvas=panel.locator('canvas'),stage=panel.locator('.twin3d-stage');
  await expect(canvas).toBeVisible();await mkdir('artifacts/hologram',{recursive:true});await canvas.scrollIntoViewIfNeeded();await page.waitForTimeout(1200);
  const saved=await page.evaluate(()=>localStorage.getItem('elevai-manual-registry:v1'));
  await expect(panel.locator('[data-status="critical"]')).toHaveCount(1);await expect(panel.locator('[data-status="warning"]')).toHaveCount(1);await expect(panel.locator('[data-status="normal"]')).toHaveCount(2);
  await stage.screenshot({path:'artifacts/hologram/mixed-status.png'});
  const draws=await page.evaluate(()=>window.__draws);await page.waitForTimeout(500);if(await page.evaluate(()=>window.__draws)<=draws)throw Error('Holographic scan animation is not running');
  async function centered(){await expect.poll(()=>page.evaluate(()=>{const h=document.querySelector('.twin3d-canvas'),dot=document.querySelector('.twin3d-anchor');return Math.hypot(parseFloat(dot.style.left)-h.clientWidth/2,parseFloat(dot.style.top)-h.clientHeight/2);})).toBeLessThan(2);}
  await panel.getByLabel('Inspect component',{exact:true}).selectOption('vfd_drive');await canvas.scrollIntoViewIfNeeded();await page.waitForTimeout(1100);await centered();
  await expect(panel.getByRole('region',{name:'Selected component callout'})).toContainText('Estimated RUL');await expect(panel.locator('.inspection-panel [data-rul-mode]')).toHaveAttribute('data-rul-mode','baseline');
  await stage.screenshot({path:'artifacts/hologram/focused.png'});
  const rect=await canvas.boundingBox();await page.mouse.dblclick(rect.x+rect.width/2,rect.y+rect.height/2,{delay:80});
  await expect(panel.getByRole('button',{name:'Return component',exact:true})).toBeVisible();await page.waitForTimeout(1100);await centered();await expect(panel.getByLabel('Inspect component')).toHaveValue('vfd_drive');await expect(stage).toContainText('17 visible');
  await panel.getByRole('button',{name:'Rotate left',exact:true}).click();await page.waitForTimeout(1100);await centered();await stage.screenshot({path:'artifacts/hologram/separated.png'});
  await panel.getByRole('button',{name:'Return component',exact:true}).click();await page.waitForTimeout(1100);await centered();
  for(const mode of ['Explode','Assemble']){await panel.getByRole('button',{name:mode,exact:true}).click();await page.waitForTimeout(1000);await centered();}
  await panel.getByLabel('Inspect component').selectOption('brake');await page.waitForTimeout(1000);await centered();await expect(panel.getByRole('region',{name:'Selected component callout'})).toContainText('Critical');
  await page.setViewportSize({width:390,height:844});await canvas.scrollIntoViewIfNeeded();await page.waitForTimeout(1000);await centered();await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)).toBeLessThanOrEqual(1);
  const canvasBox=await canvas.boundingBox(),calloutBox=await panel.locator('.twin3d-callout').boundingBox();if(calloutBox.y<canvasBox.y+canvasBox.height)throw Error('Mobile callout overlays the model');await stage.screenshot({path:'artifacts/hologram/mobile-focused.png'});
  await page.emulateMedia({reducedMotion:'reduce'});await page.waitForTimeout(400);const frozen=await page.evaluate(()=>window.__draws);await page.waitForTimeout(400);if(await page.evaluate(()=>window.__draws)!==frozen)throw Error('Reduced motion still renders ambient animation');
  if(await page.evaluate(()=>localStorage.getItem('elevai-manual-registry:v1'))!==saved)throw Error('Visual interaction mutated observations');
  // Actual non-demo, increasing condition-index history must be labelled separately.
  await page.evaluate(()=>{const data=JSON.parse(localStorage.getItem('elevai-manual-registry:v1')),e=data.elevators[0],base=e.componentInspections.find(r=>r.componentId==='brake');e.componentInspections=e.componentInspections.filter(r=>r.componentId!=='brake');for(let i=0;i<3;i++)e.componentInspections.push({...base,id:'real-'+i,start:`2026-02-0${i+1}T00:00:00Z`,end:`2026-02-0${i+2}T00:00:00Z`,generatedSample:false,demoTarget:undefined,source:'Browser test fixture',values:{brake_temperature:[40,80,100][i],brake_response_time:50,brake_wear:10,fault_count:0}});localStorage.setItem('elevai-manual-registry:v1',JSON.stringify(data));});
  await page.reload();await panel.getByLabel('Inspect component').selectOption('brake');await expect(panel.locator('.inspection-panel [data-rul-mode]')).toHaveAttribute('data-rul-mode','history');await expect(panel.locator('.inspection-panel')).toContainText('Predicted RUL · measured trend: 5 days');
  if(errors.length)throw Error(errors.join('\n'));
  console.log('PASS: compiled hologram shaders, simultaneous white/amber/red, subtle animation, click focus, real mesh double-click separation, centered orbit, reversible layout transitions, recorded-observation RUL modes, mobile callout, reduced motion and unchanged persistence.');
}finally{await browser.close();}
