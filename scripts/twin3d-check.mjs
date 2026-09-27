import { chromium, expect } from '@playwright/test';
import { readFile, mkdir } from 'node:fs/promises';
const browser=await chromium.launch({channel:'msedge',headless:true,args:['--enable-unsafe-swiftshader']});
try{
  const context=await browser.newContext({viewport:{width:1500,height:1900},reducedMotion:'reduce'}),page=await context.newPage(),errors=[];
  page.setDefaultTimeout(15000);page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>{window.__draws=0;for(const type of [WebGLRenderingContext,WebGL2RenderingContext])for(const name of ['drawElements','drawArrays']){const original=type.prototype[name];type.prototype[name]=function(...args){window.__draws++;return original.apply(this,args);};}});
  const backup=JSON.parse(await readFile('artifacts/manual/test-backup.json','utf8'));backup.selectedId=backup.elevators[0].id;
  await page.goto('http://127.0.0.1:5174/');await page.evaluate(data=>localStorage.setItem('elevai-manual-registry:v1',JSON.stringify(data)),backup);await page.reload();
  const before=await page.evaluate(()=>localStorage.getItem('elevai-manual-registry:v1'));
  await page.getByRole('link',{name:'Digital Twin',exact:true}).click();
  const panel=page.getByRole('region',{name:'Interactive elevator assembly'}),canvas=panel.locator('canvas');
  await expect(canvas).toBeVisible();await expect(panel.locator('.twin3d-error')).toHaveCount(0);
  await expect(panel.locator('[data-component-id]')).toHaveCount(17);await expect(panel.locator('[data-status="unknown"]')).toHaveCount(17);
  await expect(panel.getByLabel('Show Gearbox',{exact:true})).toBeDisabled();
  await mkdir('artifacts/twin3d',{recursive:true});await page.waitForTimeout(900);
  const draws=await page.evaluate(()=>window.__draws);if(!draws)throw Error('No WebGL draw calls');await page.waitForTimeout(300);if(await page.evaluate(()=>window.__draws)!==draws)throw Error('Unnecessary idle rendering');
  await panel.screenshot({path:'artifacts/twin3d/assembled.png'});
  await panel.scrollIntoViewIfNeeded();const original=await canvas.screenshot();
  await panel.getByRole('button',{name:'Rotate left',exact:true}).click();await page.waitForTimeout(900);const rotated=await canvas.screenshot();if(original.equals(rotated))throw Error('Rotation did not change the rendered scene');
  await panel.getByRole('button',{name:'Reset view',exact:true}).click();await page.waitForTimeout(900);await page.waitForTimeout(900);if(!original.equals(await canvas.screenshot()))throw Error('Camera reset did not restore the assembled view');
  await panel.getByRole('button',{name:'Zoom in',exact:true}).click();await page.waitForTimeout(900);if(original.equals(await canvas.screenshot()))throw Error('Zoom did not change rendering');await panel.getByRole('button',{name:'Reset view',exact:true}).click();await page.waitForTimeout(900);
  await canvas.hover();await page.mouse.wheel(0,-180);await page.mouse.move(1,1);await page.waitForTimeout(900);if(original.equals(await canvas.screenshot()))throw Error('Mouse wheel did not zoom');await panel.getByRole('button',{name:'Reset view',exact:true}).click();await page.waitForTimeout(900);
  const rect=await canvas.boundingBox();await page.mouse.move(rect.x+rect.width*.5,rect.y+rect.height*.5);await page.mouse.down({button:'right'});await page.mouse.move(rect.x+rect.width*.5+60,rect.y+rect.height*.5+20,{steps:10});await page.mouse.up({button:'right'});await page.mouse.move(1,1);await page.waitForTimeout(900);if(original.equals(await canvas.screenshot()))throw Error('Pan did not change rendering');await panel.getByRole('button',{name:'Reset view',exact:true}).click();await page.waitForTimeout(900);
  await panel.locator('[data-component-id="traction_motor"] button').click();await expect(panel.getByRole('heading',{name:'Existing recorded motor readings'})).toBeVisible();
  await panel.getByRole('button',{name:'Focus component',exact:true}).click();await panel.getByRole('button',{name:'Isolate component',exact:true}).click();await page.waitForTimeout(900);
  await expect(panel.locator('.twin3d-stage-label')).toContainText('1 visible');
  // Clear focus, then click a real visible mesh and verify hover/selection synchronization.
  await panel.getByRole('button',{name:'Clear selection',exact:true}).click();
  await canvas.scrollIntoViewIfNeeded();await page.waitForTimeout(900);const focusRect=await canvas.boundingBox();await page.mouse.move(focusRect.x+focusRect.width/2,focusRect.y+focusRect.height/2);const hovered=await panel.locator('.twin3d-hover').innerText();if(hovered.startsWith('Drag'))throw Error('Raycast did not find the centered assembly');await page.mouse.click(focusRect.x+focusRect.width/2,focusRect.y+focusRect.height/2);await expect(panel.locator('.twin3d-inspector h3')).toHaveText(hovered);await expect(panel.getByLabel('Inspect component')).not.toHaveValue('');await panel.locator('[data-component-id="traction_motor"] button').click();
  await panel.getByText('Visualization test · preview a supplied status',{exact:true}).click();await panel.getByLabel('Preview component status').selectOption('repair');
  await expect(panel.locator('[data-status="repair"]')).toHaveCount(1);await expect(panel.locator('[data-status="unknown"]')).toHaveCount(16);await expect(panel.locator('.twin3d-preview-banner')).toContainText('Not an assessment');
  await panel.screenshot({path:'artifacts/twin3d/repair-preview.png'});
  await panel.getByRole('button',{name:'Clear visual test'}).click();await expect(panel.locator('[data-status="unknown"]')).toHaveCount(17);
  await panel.getByRole('button',{name:'Clear selection',exact:true}).click();await panel.getByRole('button',{name:'Reset view',exact:true}).click();await page.waitForTimeout(900);
  await canvas.scrollIntoViewIfNeeded();await page.waitForTimeout(900);const reassembled=await canvas.screenshot();if(!original.equals(reassembled))throw Error('Clearing preview and selection did not restore the original appearance');
  await panel.getByRole('button',{name:'Explode',exact:true}).click();await canvas.scrollIntoViewIfNeeded();await page.waitForTimeout(800);await expect(panel.getByLabel('Component separation')).toHaveValue('1');if(reassembled.equals(await canvas.screenshot()))throw Error('Explode did not move rendered geometry');await panel.screenshot({path:'artifacts/twin3d/exploded.png'});
  await panel.getByRole('button',{name:'Assemble',exact:true}).click();await page.waitForTimeout(800);
  await panel.getByLabel('Schematic layout').selectOption('geared');await expect(panel.getByLabel('Show Gearbox',{exact:true})).toBeEnabled();await expect(panel.locator('.twin3d-stage-label')).toContainText('17 visible');
  for(const row of await panel.locator('[data-component-id]').all()){const id=await row.getAttribute('data-component-id');await row.locator('button').click();await expect(panel.locator('.twin3d-inspector code')).toHaveText(id);}
  await panel.locator('[data-component-id="gearbox"] button').click();await panel.getByRole('button',{name:'Isolate component'}).click();await expect(panel.locator('.twin3d-stage-label')).toContainText('1 visible');
  await panel.getByLabel('Schematic layout').selectOption('gearless');await expect(panel.locator('.twin3d-stage-label')).toContainText('16 visible');await expect(panel.getByLabel('Show Gearbox',{exact:true})).toBeDisabled();
  await panel.getByLabel('Show Ropes',{exact:true}).uncheck();await expect(panel.locator('.twin3d-stage-label')).toContainText('15 visible');await panel.getByRole('button',{name:'Show all',exact:true}).click();
  // Repeated mount/unmount exercises cleanup and default assembled state.
  for(let i=0;i<4;i++){await page.getByRole('link',{name:'Overview',exact:true}).click();await expect(page.locator('.twin3d canvas')).toHaveCount(0);await page.getByRole('link',{name:'Digital Twin',exact:true}).click();await expect(canvas).toHaveCount(1);await expect(panel.getByLabel('Component separation')).toHaveValue('0');}
  await page.setViewportSize({width:390,height:844});await page.waitForTimeout(800);if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1))throw Error('3D panel overflows mobile viewport');await panel.screenshot({path:'artifacts/twin3d/mobile.png'});
  if(await page.evaluate(()=>localStorage.getItem('elevai-manual-registry:v1'))!==before)throw Error('Visualization changed persisted elevator data');
  const fallback=await context.newPage();await fallback.addInitScript(()=>{const original=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(type,...args){return type.startsWith('webgl')?null:original.call(this,type,...args);};});await fallback.goto('http://127.0.0.1:5174/#/twin');await expect(fallback.locator('.twin3d-error')).toContainText('3D rendering is unavailable');await fallback.locator('[data-component-id="ropes"] button').click();await expect(fallback.locator('.twin3d-inspector h3')).toHaveText('Ropes');await expect(fallback.getByRole('heading',{name:'Operational usage',exact:true})).toBeVisible();
  if(errors.length)throw Error(errors.join('\n'));
  console.log('PASS: 17 components, real WebGL rendering, rotation/zoom/pan/reset, raycast/list selection, focus/isolation, supplied-status preview, reversible explosion, geared/gearless, visibility, repeat mount cleanup, mobile layout, unchanged persistence and WebGL fallback.');
}finally{await browser.close();}
