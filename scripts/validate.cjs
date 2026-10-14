const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const BuildProgress = require('../progress.js');
const root = path.resolve(__dirname, '..');
const read = file => JSON.parse(fs.readFileSync(path.join(root, file), 'utf8'));
const catalogs = { pack: read('assets/pack-parts.json'), wand: read('assets/wand-parts.json') };
for (const [kind, catalog] of Object.entries(catalogs)) {
  const keys = Object.keys(catalog.parts);
  assert.equal(keys.length, kind === 'pack' ? 76 : 22);
  const bytes = fs.readFileSync(path.join(root, 'assets', `${kind}_assembly.glb`));
  assert.equal(bytes.toString('ascii', 0, 4), 'glTF');
  const gltf = JSON.parse(bytes.toString('utf8', 20, 20 + bytes.readUInt32LE(12)));
  const modelKeys = gltf.nodes.filter(n => n.mesh !== undefined).map(n => n.extras?.part_key || n.name);
  assert.deepEqual(new Set(modelKeys), new Set(keys));
  assert.equal(modelKeys.length, keys.length, 'Duplicate model keys');
  const plateKeys = catalog.plates.flatMap(p => p.keys || []);
  assert.equal(plateKeys.length, keys.length);
  assert.deepEqual(new Set(plateKeys), new Set(keys));
  for (const [key, part] of Object.entries(catalog.parts)) {
    assert.equal(part.status, 'pending', `Public default must be blank: ${key}`);
    assert.ok(part.source.startsWith('q-pack\\'));
    assert.equal(part.explode.length, 3);
    assert.ok(part.explode.every(Number.isFinite));
  }
}
const progressIndex = process.argv.indexOf('--progress');
if (progressIndex >= 0 && !process.argv[progressIndex + 1]) throw new Error('--progress requires a path');
const progressPath = progressIndex >= 0 ? path.resolve(process.argv[progressIndex + 1]) : path.join(root, 'progress.json');
BuildProgress.validate(JSON.parse(fs.readFileSync(progressPath, 'utf8')), catalogs);
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
new Function(html.match(/<script>([\s\S]*?)<\/script>/)[1]);
assert.throws(() => BuildProgress.validate({ version: 1, parts: { pack: { unknown: { status: 'printed' } }, wand: {} } }, catalogs));
assert.throws(() => BuildProgress.validate({ version: 1, parts: { pack: {}, wand: { rear_box: { status: 'accepted' } } } }, catalogs));
assert.equal(BuildProgress.visualStatus('needs_rework'), 'pending');
assert.equal(BuildProgress.visualStatus('assembled'), 'printed');
console.log('Catalogs, 98 unique meshes, plate coverage, blank defaults, progress format, and JavaScript validated.');
