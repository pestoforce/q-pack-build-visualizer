const { chromium } = require('playwright');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const mime = { '.html': 'text/html', '.js': 'application/javascript', '.json': 'application/json', '.glb': 'model/gltf-binary' };

(async () => {
  const server = http.createServer((req, res) => {
    const relative = decodeURIComponent(new URL(req.url, 'http://localhost').pathname).replace(/^\/+/, '') || 'index.html';
    const file = path.resolve(root, relative);
    if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
      res.writeHead(404).end();
      return;
    }
    res.writeHead(200, { 'Content-Type': mime[path.extname(file)] || 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  let browser;
  try {
    browser = await chromium.launch({ headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
    const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); });
    page.on('dialog', dialog => dialog.accept());
    const url = `http://127.0.0.1:${server.address().port}`;
    const loaded = kind => page.waitForFunction(kind => activeAssembly === kind && loadedModel &&
      Object.keys(meshObjects).length === (kind === 'pack' ? 76 : 39), kind, { timeout: 60000 });
    await page.goto(url);
    await loaded('pack');
    assert.equal(await page.locator('#total-status').textContent(), '0 / 115');
    assert.ok(await page.evaluate(() => PLATES.filter(p => p.keys).every(p => {
      filterByPlate(p.id);
      return Object.values(meshObjects).filter(m => m.material === plateMaterial).length === p.keys.length;
    })));
    await page.locator('#card-plate10').click();
    await page.getByRole('button', { name: 'Mark highlighted group printed' }).click();
    assert.equal(await page.locator('#total-status').textContent(), '4 / 115');
    assert.equal(await page.evaluate(() => activeFilter), 'plate10');
    await page.evaluate(() => {
      const key = PLATES.find(p => p.id === 'plate10').keys[0];
      selectPart(meshObjects[key]);
    });
    await page.locator('#part-status').selectOption('fit_checked');
    await page.locator('.inspector-close').click();
    await page.getByRole('button', { name: 'Mark highlighted group printed' }).click();
    assert.equal(await page.evaluate(() => Object.values(progress.parts.pack).filter(p => p.status === 'fit_checked').length), 1);
    await page.reload();
    await loaded('pack');
    assert.equal(await page.locator('#total-status').textContent(), '4 / 115');
    await page.evaluate(() => {
      const key = Object.keys(progress.parts.pack)[0];
      selectPart(meshObjects[key]);
    });
    await page.locator('#part-status').selectOption('needs_rework');
    assert.equal(await page.locator('#total-status').textContent(), '3 / 115');
    await page.locator('.inspector-close').click();
    const downloadEvent = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Export Progress' }).click();
    const download = await downloadEvent;
    const exported = JSON.parse(fs.readFileSync(await download.path(), 'utf8'));
    assert.equal(Object.keys(exported.parts.pack).length, 4);
    await page.locator('#progress-import').setInputFiles({ name: 'bad.json', mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify({ version: 1, parts: { pack: { missing: { status: 'printed' } }, wand: {} } })) });
    await page.waitForFunction(() => document.getElementById('progress-message').textContent.includes('Import rejected'));
    assert.equal(await page.locator('#total-status').textContent(), '3 / 115');
    const imported = { version: 1, parts: { pack: {}, wand: { rear_box: { status: 'printed' } } } };
    await page.locator('#progress-import').setInputFiles({ name: 'progress.json', mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(imported)) });
    await page.waitForFunction(() => document.getElementById('total-status').textContent === '1 / 115');
    await page.locator('#assembly-wand').click();
    await loaded('wand');
    assert.equal(await page.evaluate(() => meshObjects.rear_box.userData.status), 'printed');
    assert.equal(await page.evaluate(() => meshObjects.rear_box_plate.userData.status), 'pending');
    assert.ok(await page.evaluate(() => PLATES.filter(p => p.keys).every(p => {
      filterByPlate(p.id);
      return Object.values(meshObjects).filter(m => m.material === plateMaterial).length === p.keys.length;
    })));
    assert.ok(await page.evaluate(() => Object.entries(meshObjects).every(([key, mesh]) => {
      selectPart(mesh);
      return document.getElementById('insp-name').textContent === PART_DATABASE[key].name;
    })));
    const addedKeys = ['front_Grip', 'Grey_tip', 'Metal_tip', 'front_tube', 'front_knob', 'top_knob_V2',
      'banjo_main_1', 'banjo_main_2', 'banjo_fake_screw_1', 'banjo_fake_screw_2',
      'hat_front', 'hat_body', 'hat_plug_front', 'hat_plug_body', 'long_hat_inside_body',
      'long_sloblow_red', 'long_sloblow_clear'];
    assert.ok(await page.evaluate(keys => {
      onExplodeChange(100);
      const moved = keys.every(key => meshObjects[key].position.distanceTo(initialPositions[key]) > 1);
      onExplodeChange(0);
      return moved && keys.every(key => meshObjects[key].position.distanceTo(initialPositions[key]) < .001);
    }, addedKeys));
    await page.locator('.inspector-close').click();
    await page.evaluate(() => selectPart(meshObjects.hat_plug_front));
    await page.locator('#part-status').selectOption('printed');
    assert.equal(await page.evaluate(() => meshObjects.hat_plug_body.userData.status), 'pending');
    assert.equal(await page.locator('#total-status').textContent(), '2 / 115');
    await page.locator('.inspector-close').click();
    await page.locator('#card-plate12').click();
    assert.equal(await page.evaluate(() => Object.values(meshObjects).filter(m => m.material === plateMaterial).length), 4);
    await page.locator('#sidebar .sidebar-header .btn').click();
    await page.locator('#assembly-pack').click();
    await loaded('pack');
    assert.ok(await page.evaluate(() => {
      onExplodeChange(100);
      const moved = Object.entries(meshObjects).every(([key, m]) => m.position.distanceTo(initialPositions[key]) > .01);
      onExplodeChange(0);
      return moved && Object.entries(meshObjects).every(([key, m]) => m.position.distanceTo(initialPositions[key]) < .001);
    }));
    await page.locator('#btn-ghost').click();
    assert.equal(await page.evaluate(() => Object.values(meshObjects).filter(m => m.visible).length), 0);
    await page.locator('#btn-ghost').click();
    await page.locator('#btn-solid').click();
    assert.ok(await page.evaluate(() => Object.values(meshObjects).every(m => !m.material.transparent)));
    await page.setViewportSize({ width: 1366, height: 768 });
    for (const preset of ['iso', 'docking', 'rear', 'side', 'front']) await page.locator(`[data-view="${preset}"]`).click();
    assert.deepEqual(errors, []);
    console.log('Browser: blank start, every group, all 39 wand inspectors, 17 added exploded pieces, independent plug copies, status edits, milestones, persistence, old progress import/export, both models and cameras passed.');
  } finally {
    if (browser) await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
