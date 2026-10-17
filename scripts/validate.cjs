const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const BuildProgress = require('../progress.js');
const root = path.resolve(__dirname, '..');
const read = file => JSON.parse(fs.readFileSync(path.join(root, file), 'utf8'));
const catalogs = { pack: read('assets/pack-parts.json'), wand: read('assets/wand-parts.json') };
const wandManifest = read('scripts/build-manifest.json').wand;
assert.deepEqual(new Set(wandManifest.map(p => p.key)), new Set(Object.keys(catalogs.wand.parts)));
assert.equal(wandManifest.length, Object.keys(catalogs.wand.parts).length);
for (const part of wandManifest) {
  assert.equal(part.source_path, catalogs.wand.parts[part.key].source);
  assert.equal(part.rotation_rad.length, 3);
  assert.equal(part.translation_mm.length, 3);
  assert.ok([...part.rotation_rad, ...part.translation_mm].every(Number.isFinite));
  for (const variant of Object.values(part.variants || {})) {
    assert.ok(variant.source_path.startsWith('q-pack\\WAND\\FRONT\\'));
    assert.equal(variant.rotation_rad.length, 3);
    assert.equal(variant.translation_mm.length, 3);
    assert.ok([...variant.rotation_rad, ...variant.translation_mm].every(Number.isFinite));
  }
}
const wandPose = key => wandManifest.find(p => p.key === key);
assert.deepEqual(wandPose('front_Grip').translation_mm, [-109.22, 221.8, -98.41]);
assert.deepEqual(wandPose('Front_Barrel_22mm').variants.gbfans.translation_mm, [0, -220, 0]);
assert.deepEqual(wandPose('Metal_tip').variants.gbfans.translation_mm, [0, 0, 0]);
assert.deepEqual(wandPose('top_knob_V2').translation_mm, [-24, .9, 92]);
for (const [kind, catalog] of Object.entries(catalogs)) {
  const keys = Object.keys(catalog.parts);
  assert.equal(keys.length, kind === 'pack' ? 76 : 39);
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
console.log('Catalogs, 115 unique meshes, wand regeneration manifest, plate coverage, blank defaults, progress format, and JavaScript validated.');
