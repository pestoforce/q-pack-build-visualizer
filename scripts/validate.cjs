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
const packAlignment = read('assets/pack-alignment.json');
const packPose = stem => {
  const row = packAlignment.find(p => p.key === `pack_${stem}`);
  assert.ok(row, `Missing pack pose: ${stem}`);
  return row;
};
const near = (actual, expected, message, tolerance = .02) =>
  assert.ok(Math.abs(actual - expected) < tolerance, `${message}: ${actual} != ${expected}`);
const pointAt = (pose, point) => {
  const [x, y, z] = pose.rotation_rad;
  const [a, b, c] = point;
  const ry = b * Math.cos(x) - c * Math.sin(x);
  const rz = b * Math.sin(x) + c * Math.cos(x);
  const rx = a * Math.cos(y) + rz * Math.sin(y);
  const zz = -a * Math.sin(y) + rz * Math.cos(y);
  return [rx * Math.cos(z) - ry * Math.sin(z),
    rx * Math.sin(z) + ry * Math.cos(z), zz].map((v, i) => v + pose.translation_mm[i]);
};
const hga = packPose('HGA_L_XL_XXL_01');
pointAt(hga, [-46.6, 130.293467, 54.976828]).forEach((v, i) =>
  near(v, [103.4, 450.293472, 54.976828][i], 'HGA base hole must meet gearbox side hole'));
const lens = packPose('Powercell_Lens_01');
near(lens.bounds_mm[0][2], 101.6, 'Lens must sit on front aperture rim');
near(lens.bounds_mm[1][2] - lens.bounds_mm[0][2], 2.5, 'Lens must remain flat in XY');
for (const [x, y] of [[-159.9, 267.788736], [-145.7, 366.788736]]) {
  assert.ok(x > lens.bounds_mm[0][0] && x < lens.bounds_mm[1][0], 'Lens must cover aperture width');
  assert.ok(y > lens.bounds_mm[0][1] && y < lens.bounds_mm[1][1], 'Lens must cover aperture length');
}
const injectors = packPose('Injectors_L_XL_XXL_GB1_01');
for (const [sourceX, z] of [[-304.4, 36.5], [-304.392, 71.5]]) {
  pointAt(injectors, [sourceX, -68.1, z]).forEach((v, i) =>
    near(v, [sourceX + 153, 250.4, z][i], 'Injector flange must meet both powercell holes'));
}
for (let i = 0; i < 2; i++) {
  const suffix = `0${i + 1}`;
  const disk = packPose(`EDA_Disks_Flat_x2_${suffix}`);
  pointAt(disk, [-249.6, -110.5, 141.2]).forEach((v, axis) =>
    near(v, [[-99.6, -60][i], 209.5, 141.2][axis], 'EDA disk must meet its booster hole'));
  const fitting = packPose(`Legris_Straight_${suffix}`);
  near(fitting.bounds_mm[0][0], -18.8, 'Straight fitting must start at booster wall');
  near((fitting.bounds_mm[0][1] + fitting.bounds_mm[1][1]) / 2, 209.4 + i * 19, 'Straight fitting socket Y');
  near((fitting.bounds_mm[0][2] + fitting.bounds_mm[1][2]) / 2, 95.2, 'Straight fitting socket Z');
}
const frame = packPose('Booster_Frame_L_XL_XXL_GB1_01');
near(pointAt(frame, [-.69343, 0, 6.4])[0], -78.85398, 'Frame must share booster tube centerline');
assert.ok(pointAt(frame, [-.69343, 0, 6.4])[2] >= 139.7, 'Frame underside must not be buried in booster tube');
assert.ok(pointAt(frame, [-.69343, 0, 6.4])[2] < 140.1, 'Frame must not float above booster tube');
const ppd = packPose('PPD_Type_1_01');
const shoulderNormal = [0, .791215, .611538];
const dot = p => p.reduce((sum, v, i) => sum + v * shoulderNormal[i], 0);
const shoulderPlane = dot([-60, 233.960896, 141.2]);
const cut = [11.6104641, -50.14656448, -142.89071655];
near(dot(pointAt(ppd, cut)), shoulderPlane, 'PPD angled end must meet booster shoulder');
assert.ok(dot(pointAt(ppd, [0, -45, -194.182266])) > shoulderPlane,
  'PPD body must be outside, not inside, the booster shoulder');
pointAt(packPose('crank_knob_01'), [130.853012, 104.999, .00048]).forEach((v, i) =>
  near(v, [43.80214, 457.10002, 110.5][i], 'Crank knob must meet front gearbox seat'));
for (let i = 1; i <= 3; i++) {
  const body = packPose(`legris_elbow_GEN1_full_body_0${i}`);
  const nut = packPose(`legris_elbow_GEN1_Nut_0${i}`);
  assert.deepEqual(body.rotation_rad, nut.rotation_rad, 'Legris nut must share its elbow orientation');
  const outlet = pointAt(body, [0, -39, 0]);
  pointAt(nut, [0, 0, -21]).forEach((v, axis) =>
    near(v, outlet[axis], 'Legris nut shoulder must meet the body outlet'));
}
pointAt(packPose('legris_elbow_GEN1_full_body_03'), [0, -24.3, 14.3]).forEach((v, i) =>
  near(v, [-149.655, 427.363, 133.2][i], 'Ion-arm Legris must meet underside socket'));
const radial = [0, 0, 1];
const radialLength = Math.hypot(...radial);
for (const [stem, anchor, x] of [
  ['legris_elbow_GEN1_full_body_01', [0, -24.3, 14.3], 123.4],
  ['Clippard_Hex_01', [-11.211475, 173.494937, 140.45], 145.4],
]) {
  const seat = [x, 450.293457, 54.976826].map((v, i) => v + radial[i] / radialLength * 31.75);
  pointAt(packPose(stem), anchor).forEach((v, i) =>
    near(v, seat[i], 'HGA elbow shoulder must meet the front cylinder surface'));
}
for (const [stem, axis] of [
  ['legris_elbow_GEN1_full_body_01', [0, 0, -1]],
  ['Clippard_Hex_01', [.5, Math.sqrt(3) / 2, 0]],
]) {
  const pose = packPose(stem);
  const origin = pointAt(pose, [0, 0, 0]);
  const direction = pointAt(pose, axis).map((v, i) => v - origin[i]);
  direction.forEach((v, i) => near(v, [0, -1, 0][i], 'HGA hose outlet must bend downward', .0001));
}
for (const [stem, axis] of [
  ['legris_elbow_GEN1_full_body_01', [0, -1, 0]],
  ['Clippard_Hex_01', [0, 0, 1]],
]) {
  const pose = packPose(stem);
  const origin = pointAt(pose, [0, 0, 0]);
  const direction = pointAt(pose, axis).map((v, i) => v - origin[i]);
  direction.forEach((v, i) =>
    near(v, [0, 0, 1][i], 'HGA long stem must face forward, not upward', .0001));
}
pointAt(packPose('Dale_RH_50_01'), [25.434893, 200.136230, 89.345100]).forEach((v, i) =>
  near(v, [-120.655, 460.363003, 165.2][i], 'RH-50 must mount on the ion arm, not booster box'));
const shortResistor = packPose('Sage_RH_25_01');
pointAt(shortResistor, [346.95618, 338.574707, 64.53]).forEach((v, i) =>
  near(v, [-144.655, 460.363, 198.2][i], 'Short resistor must mount on the outer ion-arm step'));
near(shortResistor.bounds_mm[1][0], -144.655, 'Short resistor base must contact outer wall');
assert.ok(shortResistor.bounds_mm[0][0] < -158, 'Short resistor body must project outward, not into ion arm');
assert.ok(shortResistor.bounds_mm[1][2] - shortResistor.bounds_mm[0][2] > 26,
  'Short resistor long axis must stand vertically');
assert.match(packPose('legris_elbow_GEN1_full_body_02').alignment, /illustrative/);
assert.match(packPose('Adaptaflex_elbow_full_body_01').alignment, /NOT established/);
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
  if (kind === 'pack') {
    for (const node of gltf.nodes.filter(n => n.mesh !== undefined)) {
      const pose = packPose((node.extras?.part_key || node.name).slice(5));
      const [x, y, z] = pose.translation_mm;
      (node.translation || [0, 0, 0]).forEach((v, i) =>
        near(v, [x, z, -y][i], 'GLB translation must agree with pack alignment report'));
    }
  }
  const plateKeys = catalog.plates.flatMap(p => p.keys || []);
  assert.equal(plateKeys.length, keys.length);
  assert.deepEqual(new Set(plateKeys), new Set(keys));
  for (const [key, part] of Object.entries(catalog.parts)) {
    assert.equal(part.status, 'pending', `Public default must be blank: ${key}`);
    assert.ok(part.source.startsWith('q-pack\\'));
    assert.equal(part.explode.length, 3);
    assert.ok(part.explode.every(Number.isFinite));
  }
  assert.deepEqual(new Set(packAlignment.map(p => p.key)), new Set(Object.keys(catalogs.pack.parts)));
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
console.log('Catalogs, 115 unique meshes, pack mounting relationships and exported poses, wand regeneration manifest, plate coverage, blank defaults, progress format, and JavaScript validated.');
