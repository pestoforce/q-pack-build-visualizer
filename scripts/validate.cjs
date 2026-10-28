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
const mountingAudit = read('scripts/pack-mounting-constraints.json');
assert.equal(mountingAudit.relationships.length, 57, 'Mounting audit relationship coverage');
assert.equal(mountingAudit.constraints.length, 119, 'Mounting audit bore-segment coverage');
const checkMountingConstraints = (audit, getPose) => {
for (const constraint of audit.constraints) {
  const anchors = [constraint.a, constraint.b].map(anchor => {
    const pose = getPose(anchor.key);
    const origin = pointAt(pose, [0, 0, 0]);
    const vector = pointAt(pose, anchor.axis).map((v, i) => v - origin[i]);
    const length = Math.hypot(...vector);
    return { point: pointAt(pose, anchor.point), axis: vector.map(v => v / length) };
  });
  const [a, b] = anchors;
  const delta = b.point.map((v, i) => v - a.point[i]);
  const axial = delta.reduce((sum, v, i) => sum + v * a.axis[i], 0);
  const radial = Math.hypot(...delta.map((v, i) => v - axial * a.axis[i]));
  const cosine = Math.abs(a.axis.reduce((sum, v, i) => sum + v * b.axis[i], 0));
  const label = `${constraint.a.key} / ${constraint.b.key}`;
  assert.ok(radial <= constraint.max_radial_mm, `${label}: screw axes offset by ${radial}mm`);
  assert.ok(cosine >= Math.cos(constraint.max_axis_angle_deg * Math.PI / 180),
    `${label}: screw axes have different directions`);
  near(Math.abs(axial), constraint.axial_center_distance_mm, `${label}: seating depth changed`, .03);
}
};
checkMountingConstraints(mountingAudit, key => packPose(key.slice(5)));
const wandAudit = read('scripts/wand-mounting-constraints.json');
assert.equal(wandAudit.constraints.length, 28, 'Wand mounting relationship coverage');
checkMountingConstraints(wandAudit, wandPose);
pointAt(wandPose('front_knob'), [0, 0, 0]).forEach((value, i) =>
  near(value, [-25, 23.167357, 72.33263707594463][i],
    'Front knob must mount on upper vertical tier beside wand valve'));
near(pointAt(wandPose('front_knob'), [0, 0, .232643])[1], 23.4,
  'Front knob back face must seat on upper body wall, not lower connector screw');
const loom = packPose('Wand_loom_panel_GB1_01');
loom.translation_mm.forEach((value, i) =>
  near(value, [-46.3236364, 38.1329347, 0][i], 'Loom panel must slide into the generator dovetail', .001));
for (const suffix of ['', '_2']) {
  const base = wandPose(`left_big_knob${suffix}`);
  const cap = wandPose(`left_small_knob${suffix}`);
  pointAt(cap, [-44, 11.5, 23]).forEach((value, i) =>
    near(value, pointAt(base, [-44, -29.5, 23])[i], 'Left dial cap must seat on its eccentric base screw'));
  near(pointAt(base, [-38, -36.5, 23])[0], -38, 'Left dial base must contact body wall');
}
near(pointAt(wandPose('heat_sink'), [38.86541748, 0, 0])[0], 38, 'Heat sink must contact body wall');
near(pointAt(wandPose('rear_box'), [100, 60, 0])[1], -64.5, 'Rear box must sit outside body rear face');
near(pointAt(wandPose('rear_fitting'), [48.36999, -77, 42.85])[2], 42.85,
  'Rear hose nut must seat on box top');
for (const i of [1, 2]) {
  assert.deepEqual(wandPose(`banjo_fake_screw_${i}`).rotation_rad, wandPose(`banjo_main_${i}`).rotation_rad);
  assert.deepEqual(wandPose(`banjo_fake_screw_${i}`).translation_mm, wandPose(`banjo_main_${i}`).translation_mm);
}
for (const [key, seat] of [
  ['banjo_main_1', [-6.92, 261, 22.22]],
  ['banjo_main_2', [-19.145, 228.15, 9.52]],
]) {
  const pose = wandPose(key);
  pointAt(pose, [0, -5, 7.5]).forEach((value, i) =>
    near(value, seat[i], 'Banjo must seat on front barrel/tip negative-X mounting lug'));
  near(pointAt(pose, [0, 0, 28.4])[2], seat[2] - 20.9, 'Banjo hose outlet must point down');
  assert.ok(pose.translation_mm[1] > 220, 'Neither banjo belongs on rear tube or rear ear');
}
const hga = packPose('HGA_L_XL_XXL_01');
const topShellPoint = p => [p[0] - 7.955, p[1] + 10.863, p[2]];
pointAt(hga, [-46.6, 130.293467, 54.976828]).forEach((v, i) =>
  near(v, topShellPoint([103.4, 450.293472, 54.976828])[i], 'HGA base hole must meet gearbox side hole'));
const lens = packPose('Powercell_Lens_01');
near(lens.bounds_mm[0][2], 101.6, 'Lens must sit on front aperture rim');
near(lens.bounds_mm[1][2] - lens.bounds_mm[0][2], 2.5, 'Lens must remain flat in XY');
for (const [x, y] of [[-159.9, 267.788736], [-145.7, 366.788736]]) {
  assert.ok(x - 7.955 > lens.bounds_mm[0][0] && x - 7.955 < lens.bounds_mm[1][0], 'Lens must cover aperture width');
  assert.ok(y + 10.863 > lens.bounds_mm[0][1] && y + 10.863 < lens.bounds_mm[1][1], 'Lens must cover aperture length');
}
const injectors = packPose('Injectors_L_XL_XXL_GB1_01');
for (const [sourceX, z] of [[-304.4, 36.5], [-304.392, 71.5]]) {
  pointAt(injectors, [sourceX, -68.1, z]).forEach((v, i) =>
    near(v, topShellPoint([sourceX + 153, 250.4, z])[i], 'Injector flange must meet both powercell holes'));
}
for (let i = 0; i < 2; i++) {
  const suffix = `0${i + 1}`;
  const disk = packPose(`EDA_Disks_Flat_x2_${suffix}`);
  pointAt(disk, [-249.6, -110.5, 141.2]).forEach((v, axis) =>
    near(v, topShellPoint([[-99.6, -60][i], 209.5, 141.2])[axis], 'EDA disk must meet its booster hole'));
  const fitting = packPose(`Legris_Straight_${suffix}`);
  near(fitting.bounds_mm[0][0], -26.755, 'Straight fitting must start at booster wall');
  near((fitting.bounds_mm[0][1] + fitting.bounds_mm[1][1]) / 2, 220.263 + i * 19, 'Straight fitting socket Y');
  near((fitting.bounds_mm[0][2] + fitting.bounds_mm[1][2]) / 2, 95.2, 'Straight fitting socket Z');
}
const frame = packPose('Booster_Frame_L_XL_XXL_GB1_01');
near(pointAt(frame, [-.69343, 0, 6.4])[0], -78.85351, 'Frame must share booster tube centerline');
const frameSeat = pointAt(frame, [-.69343, 0, 6.4]);
assert.ok(frameSeat[2] >= 139.7, 'Frame underside must not be buried in booster tube');
assert.ok(frameSeat[2] < 140.1, 'Frame must not float above booster tube');
const ppd = packPose('PPD_Type_1_01');
pointAt(packPose('Beamline_L_XL_XXL_01'), [-11.21147585, 173.49493408, 32.5])
  .forEach((value, axis) => near(value, [-11.21147378, 173.49493956, 32.5][axis],
    'Beamline base must center on the upper center-cover screw aperture beside the filler tube'));
const shoulderNormal = [0, .791215, .611538];
const dot = p => p.reduce((sum, v, i) => sum + v * shoulderNormal[i], 0);
const shoulderPlane = dot(topShellPoint([-60, 233.960896, 141.2]));
const ppdBase = pointAt(ppd, [0, -45, -194.18226624]);
near(ppdBase[0], -34.8799174, 'PPD axis must match booster-box 01 cylindrical cutout X');
near(ppdBase[2], 136.0751106, 'PPD axis must match booster-box 01 cylindrical cutout Z');
near(ppdBase[1], 195.063, 'PPD flat end must meet the cutout mouth with both side screws aligned');
assert.ok(ppd.bounds_mm[0][1] - packPose('Beamline_L_XL_XXL_01').bounds_mm[1][1] > 3,
  'PPD and beamline must have positive clearance, not intersect');
const ppdEnd = pointAt(ppd, [0, -45, -144.18226624]);
assert.ok(Math.abs(ppdEnd[0] - ppdBase[0]) < .001 &&
  Math.abs(ppdEnd[2] - ppdBase[2]) < .001 &&
  Math.abs(ppdEnd[1] - ppdBase[1] - 50) < .001,
  'PPD axis must be parallel to pack Y, hanging straight down rather than normal to the slope');
assert.ok(dot(ppdBase) < shoulderPlane - 40,
  'PPD flat end must hang below the shoulder, not be mounted onto its upper face');
const lowerTube = packPose('Booster_Tube_PART2_L_01');
const rimCenter = pointAt(lowerTube, [-78.85350990, 972.72393799, 107.94999695]);
near(rimCenter[0], -78.85351225, 'Tube axis must match booster opening X');
near(rimCenter[2], 107.95, 'Tube axis must match booster opening Z');
const tubeAxis = pointAt(lowerTube, [-78.85351, 1000, 107.95]);
const tubeAxisNext = pointAt(lowerTube, [-78.85351, 1010, 107.95]);
near(tubeAxisNext[2], tubeAxis[2], 'Tube must remain untilted so both underside screw axes match the box', .001);
pointAt(packPose('crank_knob_01'), [130.853012, 104.999, .00048]).forEach((v, i) =>
  near(v, topShellPoint([43.80214, 457.10002, 110.5])[i], 'Crank knob must meet front gearbox seat'));
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
    near(v, topShellPoint(seat)[i], 'HGA elbow shoulder must meet the front cylinder surface'));
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
assert.deepEqual(wandPose('front_Grip').translation_mm,
  [139.63882269300768, 101.19, 147.11000692882186]);
assert.deepEqual(wandPose('Front_Barrel_22mm').variants.gbfans.translation_mm, [0, -220, 0]);
assert.deepEqual(wandPose('Metal_tip').variants.gbfans.translation_mm, [0, 0, 0]);
assert.deepEqual(wandPose('top_knob_V2').translation_mm, [-24, .9, 92]);
pointAt(wandPose('long_sloblow_red'), [-21.5, 0, 2]).forEach((v, i) =>
  near(v, [26.15, -77, 42.85][i],
    'Red Slo-Blo shoulder must seat on rear electrical box, not main-body switch panel'));
pointAt(wandPose('front_tube'), [125, 105, 0]).forEach((v, i) =>
  near(v, [-18.5, 61.5, 22.22][i], 'Black front cylinder must meet lower-front fixing beside barrel'));
near(pointAt(wandPose('front_tube'), [125, 105, 42])[1], 103.5,
  'Black front cylinder must project forward rather than hide inside receiver');
assert.ok(pointAt(wandPose('wand_clippard_body'), [-7.9, -35.21439, 88.9])[2] > 47.9,
  'Asymmetric wand valve flange must be clocked clear of lower ledge');
pointAt(wandPose('long_hat_inside_body'), [-15, 15, 0]).forEach((v, i) =>
  near(v, [-27, 52, 47.9][i],
    'Orange indicator base must sit on lower ledge, not occupy upper valve opening'));
for (const [kind, catalog] of Object.entries(catalogs)) {
  const keys = Object.keys(catalog.parts);
  assert.equal(keys.length, kind === 'pack' ? 76 : 44);
  const bytes = fs.readFileSync(path.join(root, 'assets', `${kind}_assembly.glb`));
  assert.equal(bytes.toString('ascii', 0, 4), 'glTF');
  const gltf = JSON.parse(bytes.toString('utf8', 20, 20 + bytes.readUInt32LE(12)));
  const modelKeys = gltf.nodes.filter(n => n.mesh !== undefined).map(n => n.extras?.part_key || n.name);
  assert.deepEqual(new Set(modelKeys), new Set(keys));
  assert.equal(modelKeys.length, keys.length, 'Duplicate model keys');
  {
    for (const node of gltf.nodes.filter(n => n.mesh !== undefined)) {
      const key = node.extras?.part_key || node.name;
      const pose = kind === 'pack' ? packPose(key.slice(5)) : wandPose(key);
      const [x, y, z] = pose.translation_mm;
      (node.translation || [0, 0, 0]).forEach((v, i) =>
        near(v, [x, z, -y][i], 'GLB translation must agree with assembly pose'));
      const [qx, qy, qz, qw] = node.rotation || [0, 0, 0, 1];
      for (const point of [[1, 0, 0], [0, 1, 0], [0, 0, 1]]) {
        const [a, b, c] = [point[0], point[2], -point[1]];
        const tx = 2 * (qy * c - qz * b);
        const ty = 2 * (qz * a - qx * c);
        const tz = 2 * (qx * b - qy * a);
        const actual = [a + qw * tx + qy * tz - qz * ty,
          b + qw * ty + qz * tx - qx * tz,
          c + qw * tz + qx * ty - qy * tx];
        const origin = pointAt(pose, [0, 0, 0]);
        const direction = pointAt(pose, point).map((v, i) => v - origin[i]);
        const expected = [direction[0], direction[2], -direction[1]];
        actual.forEach((value, i) =>
          near(value, expected[i], 'GLB rotation must agree with assembly pose', .00001));
      }
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
console.log('Catalogs, 120 unique meshes, pack/wand mounting relationships and exported poses, guide quantity correction, plate coverage, blank defaults, progress format, and JavaScript validated.');
