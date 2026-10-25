"""Build the GB1 fixed/L pack preview from local Q-Pack geometry and progress."""

import argparse
import json
import math
import struct
import zipfile
from pathlib import Path
from xml.etree import ElementTree as ET

import bpy
from mathutils import Matrix, Vector


import sys

ROOT = Path(__file__).resolve().parent.parent
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("--source", type=Path, required=True, help="Path to a Q-Pack MK4 checkout")
parser.add_argument("--output-dir", type=Path, default=ROOT / "assets",
                    help="Existing asset directory containing the pack catalog; progress is preserved")
args = parser.parse_args(sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else [])
SOURCE = args.source.resolve()
OUTPUT = args.output_dir.resolve()
PREFIX = "Q-pack-TacoShell_MK4_"
NS = {"c": "http://schemas.microsoft.com/3dmanufacturing/core/2015/02"}
bpy.ops.wm.read_factory_settings(use_empty=True)


def read_3mf(path):
    with zipfile.ZipFile(path) as archive:
        root = ET.fromstring(archive.read("3D/3dmodel.model"))
    if root.get("unit", "millimeter") != "millimeter":
        raise ValueError(f"Expected millimeter CAD coordinates: {path}")
    resources = {o.get("id"): o for o in root.findall("c:resources/c:object", NS)}

    def transform(text):
        if not text:
            return Matrix.Identity(4)
        t = [float(v) for v in text.split()]
        return Matrix(((t[0], t[3], t[6], t[9]),
                       (t[1], t[4], t[7], t[10]),
                       (t[2], t[5], t[8], t[11]), (0, 0, 0, 1)))

    vertices, faces = [], []

    def visit(object_id, matrix):
        obj = resources[object_id]
        mesh = obj.find("c:mesh", NS)
        if mesh is not None:
            offset = len(vertices)
            vertices.extend(tuple(matrix @ Vector(tuple(float(v.get(a)) for a in ("x", "y", "z"))))
                            for v in mesh.findall("c:vertices/c:vertex", NS))
            faces.extend(tuple(int(f.get(a)) + offset for a in ("v1", "v2", "v3"))
                         for f in mesh.findall("c:triangles/c:triangle", NS))
        for component in obj.findall("c:components/c:component", NS):
            visit(component.get("objectid"), matrix @ transform(component.get("transform")))

    for item in root.findall("c:build/c:item", NS):
        visit(item.get("objectid"), transform(item.get("transform")))
    if not faces:
        raise ValueError(f"No geometry in {path}")
    mesh = bpy.data.meshes.new(path.stem)
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    return mesh


def read_stl(path):
    bpy.ops.wm.stl_import(filepath=str(path))
    obj = bpy.context.selected_objects[0]
    mesh = obj.data
    bpy.data.objects.remove(obj, do_unlink=True)
    return mesh


def hex_mesh(path):
    # This STL contains three spatially separated fittings, not one print object.
    data = path.read_bytes()
    count = struct.unpack_from("<I", data, 80)[0]
    triangles = [struct.unpack_from("<9f", data, 84 + i * 50 + 12) for i in range(count)]
    first = [t for t in triangles if max(t[1::3]) < 200]
    if not first:
        raise ValueError("Cannot isolate the first Clippard hex elbow")
    vertices, faces = [], []
    for t in first:
        offset = len(vertices)
        vertices.extend((t[i], t[i + 1], t[i + 2]) for i in (0, 3, 6))
        faces.append((offset, offset + 1, offset + 2))
    mesh = bpy.data.meshes.new("single_hex_elbow")
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    return mesh


# Split shells match the unsplit CAD reference; translations are in source mm.
TRANSLATIONS = {
    "Center_Cover_L_01": (-350, 0, 0),
    "Center_Cover_L_02_sharp_corner": (-700, 0, 0),
    "Center_Cover_L_03": (-350, 0, 0),
    "Booster_box_01_L": (-350, -630, 0),
    "Booster_box_02_L": (-350, -630, 0),
    "PowerCell_L": (-350, -280, 0),
    "Crank_Gen_And_Gun_Mount_L_XL_XXL": (-550, 80, 0),
    "Booster_Tube_PART1_L": (90, -700, 0),
    "Booster_Tube_PART2_L": (0, -700, 0),
    **{f"Cyclotron_NOT REMOVABLE_L_0{i}": (-915, 430, 0) for i in range(1, 5)},
    "Bumper_01_L": (0, 915, 0),
    "Bumper_02_L": (0, 915, 0),
}
NATIVE = {
    "Booster_Plug_L_XL_XXL", "ION_ARM_CAP_L_XL_XXL-GB1",
    "Clippard_Base_GB1", "VacHose_base", "VacHose_mount", "Injector_Block_GB1",
    "Wand_loom_panel_GB1", "Filler_Tube_L_XL_XXL", "Beamline_L_XL_XXL",
    "Injector_Bracket_L_XL_XXL", "Ion_Arm_L_XL_XXL_GB1",
    "V_Hook_Base", "V_Hook_Track_GB1", "NFilter-non-remove_ver",
    *{f"SynchGen_0{i}_L" for i in range(2, 6)}, "SynchGen_01_L_XL",
}
GUIDES = {
    "SYNCHRONOUS_GENERATOR": "PDF pp. 9-10",
    "CENTER_COVER": "PDF pp. 11-12", "TOP_SHELL": "PDF pp. 13-14",
    "BOOSTER_TUBE": "PDF pp. 16-17", "BOOSTER_FRAME": "PDF p. 17",
    "INJECTORS": "PDF p. 15", "ION_ARM": "PDF pp. 18-19",
    "HGA": "PDF p. 20", "PPD": "PDF p. 21", "V_HOOK": "PDF p. 22",
    "CYCLOTRON": "PDF pp. 24-25", "BUMPER": "PDF pp. 26-27",
    "ACCESSORIES": "PDF pp. 31-36", "MOTHERBOARD": "PDF p. 37",
}

def legris_pose(copy):
    # Body +Y is the mounting spigot; -Z is the compression-nut outlet.
    hga_normal = Vector((0, 0, 1))
    sites = [
        (Vector((123.4, 450.293457, 54.976826)) + hga_normal * 31.75,
         hga_normal, Vector((0, -1, 0)),
         "HGA Legris elbow: long mounting stem faces the pack front (+Z); "
         "compression outlet bends downward (-Y). Shoulder sits on the front cylinder wall "
         "at X=123.4mm; mounting position is illustrative, not a verified socket or drilling template."),
        (Vector((112.46094, -36.54078, 99.5)), Vector((.947269, -.320441, 0)).normalized(),
         Vector((.320441, .947269, 0)).normalized(),
         "Cyclotron Legris elbow: seated on the lower-right outer wall; general site supported by references, "
         "but exact drilling position is illustrative, not a modeled socket."),
        (Vector((-149.655, 427.363, 133.2)), Vector((0, -1, 0)), Vector((0, 0, 1)),
         "Ion-arm Legris elbow: axis matched to the modeled 9.5mm underside socket."),
    ]
    seat, outward, hose, note = sites[copy]
    x, y, z = outward.cross(hose), -outward, -hose
    matrix = Matrix((x, y, z)).transposed()
    translation = seat - matrix @ Vector((0, -24.3, 14.3))
    return matrix, translation, note + " Stem seating and hose clocking require physical dry-fit."


def fitting_placement(name, copy):
    if name == "Sage-RH-25":
        source_midpoint = Vector((346.95618, 338.574707, 64.53))
        source_pitch = Vector((19.84, -18.26, 0))
        target_pitch = Vector((0, 18.3, -20))
        base = Matrix(((0, 0, -1), (0, -1, 0), (-1, 0, 0)))
        correction = (base @ source_pitch).rotation_difference(target_pitch).to_matrix()
        matrix = correction @ base
        seat = Vector((-144.655, 460.363, 198.2))
        return tuple(matrix.to_euler()), tuple(seat - matrix @ source_midpoint), (
            "Short 25W resistor on the outer stepped side of the ion arm, beside the antenna/booster frame. "
            "Long axis vertical; mounting face at X=-144.655mm, hole-pair midpoint Y=460.363/Z=198.2mm. "
            "Original source pitch26.964mm vs shell27.109mm, centered without scaling "
            "(about0.073mm residual per hole); verify screw clearance. "
            "Yellow tubing routes from its lower end to the underside Legris elbow. "
            "Distinct from the long Dale RH-50 on the inward-facing side; not a drilling template.")
    if name in {"legris_elbow_GEN1_full_body", "legris_elbow_GEN1_Nut"}:
        matrix, translation, note = legris_pose(copy)
        if name.endswith("_Nut"):
            # The separately authored nut's 3.8mm pin seats in the body's outlet.
            translation += matrix @ Vector((0, -39, 21))
            note += " Matching compression nut shares the elbow transform; pin inserted 3.8mm into its outlet."
        return tuple(matrix.to_euler()), tuple(translation), note
    if name == "Clippard_Hex" and copy == 0:
        outward = Vector((0, 0, 1))
        hose = Vector((0, -1, 0))
        side = Vector((.5, math.sqrt(3)/2, 0))
        source_basis = Matrix((side, Vector((-side.y, side.x, 0)), Vector((0, 0, 1)))).transposed()
        target_basis = Matrix((hose, outward.cross(hose), outward)).transposed()
        matrix = target_basis @ source_basis.transposed()
        seat = Vector((145.4, 450.293457, 54.976826)) + outward * 31.75
        translation = seat - matrix @ Vector((-11.211475, 173.494937, 140.45))
        return tuple(matrix.to_euler()), tuple(translation), (
            "HGA brass Clippard hex elbow: long mounting stem faces the pack front (+Z); "
            "side barb bends downward (-Y). Shoulder sits on the front cylinder wall at X=145.4mm; "
            "mounting position is illustrative, not a verified socket or drilling template. "
            "Physical seating requires dry-fit.")
    if name == "Dale_RH-50":
        source_pitch = Vector((0, 40, 21.44))
        target_pitch = Vector((0, 40.121993, 22))
        angle = math.atan2(target_pitch.z, target_pitch.y) - math.atan2(source_pitch.z, source_pitch.y)
        matrix = Matrix.Rotation(angle, 3, "X")
        source_midpoint = Vector((25.434893, 200.136230, 89.345100))
        target_midpoint = Vector((-120.655, 460.363003, 165.2))
        return tuple(matrix.to_euler()), tuple(target_midpoint - matrix @ source_midpoint), (
            "Dale RH-50 resistor on the right side of the ion arm, mounting face at X=-120.655mm. "
            "Mounting-hole pair centered and aligned, not scaled: source pitch45.384mm vs shell45.758mm "
            "(about0.187mm residual per hole). Blue hose connects its leads to the ion-arm top elbow and PPD. "
            "Not a drilling template; verify physical screw fit.")
    if name == "Adaptaflex_elbow_full_body":
        outward = Vector((.556403, -.830913, 0)).normalized()
        hose = Vector((0, 0, 1))
        x, z = -hose, outward
        matrix = Matrix((x, z.cross(x), z)).transposed()
        seat = Vector((87.86261, -125.48082, 35))
        return tuple(matrix.to_euler()), tuple(seat - matrix @ Vector((0, 0, 6))), (
            "Provisional large wand-hose/conduit elbow on the lower-right synchronous-generator shell. "
            "Mounting shoulder seated on an exterior surface, not floating beyond the pack. "
            "Exact Adaptaflex variant, attachment point and hose clocking are NOT established by the guide "
            "or reference photo; illustrative only, not an installation/drilling template.")
    return None


def placement(name, copy, mesh):
    rotation = (0, 0, 0)
    note = "Source CAD coordinates / matched assembly-layout offset."
    fitting = fitting_placement(name, copy)
    if fitting is not None:
        return fitting
    if name in TRANSLATIONS:
        return rotation, TRANSLATIONS[name], note
    if name in NATIVE:
        return rotation, (0, 0, 0), note
    if name == "EDA_Disks-Flat_x2":
        return rotation, (150 + copy * 39.6, 320, 0), "Disk centers matched to the booster screw holes at Z=141.2 mm."
    if name == "Cyclotron_Window_Top_x2_L_XL_XXL":
        return rotation, ((0, 0, 0) if copy == 0 else (-104.89, 0, 0)), note
    if name == "Cyclotron_Window_Bottom_x2_L_XL_XXL":
        return rotation, ((0, 0, 0) if copy == 0 else (78.25, 0, 0)), note
    if name == "Clamp_X2":
        return (0, 0, copy * math.pi), (0, 0, 0), "Illustrative second-clamp routing; dry-fit pending."
    if name == "Injectors_L_XL_XXL_GB1":
        return rotation, (153, 318.5, 0), "Both flange holes matched to the PowerCell lower face at Y=250.4 mm."
    if name == "HGA_L_XL_XXL":
        return rotation, (150, 320, 0), "HGA base hole coaxial with the right gearbox mounting hole at X=103.4 mm."
    if name == "PPD_Type_1":
        # The angled end, not the flat base, mates to the booster shoulder.
        from mathutils import Euler
        rotation = (math.pi / 2, math.pi / 2, 0)
        matrix = Euler(rotation).to_matrix()
        shoulder = Vector((0, .791215, .611538))
        shoulder.normalize()
        cut_point = matrix @ Vector((11.6104641, -50.14656448, -142.89071655))
        seat = Vector((-32, (shoulder.dot(Vector((-60, 233.960896, 141.2)))
                            - shoulder.z * 117) / shoulder.y, 117))
        center_on_cut = Vector((-45, cut_point.y + cut_point.z * shoulder.z / shoulder.y, 0))
        return rotation, tuple(seat - center_on_cut), "Angled end matched to the booster shoulder plane; lateral seating remains illustrative."
    if name == "crank_knob":
        return rotation, (-87.05087, 352.10102, 110.49952), "Knob underside centered over the gearbox front hole; not the HGA side wall."
    if name == "clippard_body_screws":
        return rotation, (63.65, 194.22, 2.8), "Illustrative valve on GB1 Clippard base."
    if name == "clippard_r331_top":
        return rotation, (63.65, 194.22, 2.8), "Illustrative R331 valve selection; not finalized."
    if name == "Clippard_Hex" and copy == 1:
        return rotation, (0, 0, 0), note
    if name == "Bumper_Spacer":
        return rotation, ((-1 if copy == 0 else 1) * 70, 0, 0), "Illustrative bumper supports on the cyclotron top; dry-fit pending."
    # Locally authored small details use explicit mating-site anchors.
    anchors = {
        "PH-25-without_ring": ((0, math.pi / 2, 0), (48, 245, 55)),
        "Booster_Frame_L_XL_XXL_GB1": (rotation, (-78.85398, 361, 137)),
        "Powercell_Lens": (rotation, (-152.8, 317.288736, 101.6)),
        "Shockmount_full_GB1": (rotation, (0, 0, 159.5)),
        "clippard_r331_cap_corrected": (rotation, (55.75, 177.92, 153.6)),
        "Clippard_elbow_square": (rotation, (-132.65, 465, 229)),
        "Legris_Straight": ((0, math.pi / 2, 0), (-18.8, 209.4 + copy * 19, 95.2)),
        "Cyclotron_Window_Lens_x4_L_XL_XXL": (rotation,
                                            [(52.45, 50.45, 121.5), (-52.45, 50.45, 121.5),
                                             (-39.12, -36.93, 121.5), (39.12, -36.93, 121.5)]),
        "Alice_Frame_Round_Spacer_25mm": (rotation, ((-1 if copy == 0 else 1) * 75, 30, -28)),
        "Alice_Frame_UpperSpacer_25mm": (rotation, (0, 380, -26.75)),
    }
    if name not in anchors:
        raise ValueError(f"Missing assembly placement: {name}")
    rotation, target = anchors[name]
    if isinstance(target, list):
        target = target[copy]
    from mathutils import Euler
    matrix = Euler(rotation).to_matrix()
    bounds = [matrix @ v.co for v in mesh.vertices]
    low = Vector(tuple(min(p[a] for p in bounds) for a in range(3)))
    high = Vector(tuple(max(p[a] for p in bounds) for a in range(3)))
    center = (low + high) / 2
    anchor = Vector((center.x, center.y, low.z))
    if name in {"PH-25-without_ring", "Legris_Straight", "crank_knob"}:
        anchor = Vector((low.x, center.y, center.z))
    notes = {
        "Booster_Frame_L_XL_XXL_GB1": "Centered on the booster tube, curved underside raised clear of its surface; longitudinal seating is illustrative.",
        "Powercell_Lens": "Flat over the PowerCell front aperture at Z=101.6 mm; lens material is not specified by the pose.",
        "Legris_Straight": "Coaxial with the two booster side sockets at Y=209.4/228.4, Z=95.2 mm; insertion depth is illustrative.",
    }
    return rotation, tuple(Vector(target) - anchor), notes.get(name, "Illustrative detail placement / provisional variant; verify during dry-fit.")


rows = json.loads((ROOT / "scripts" / "build-manifest.json").read_text())["pack"]
metadata = json.loads((OUTPUT / "pack-parts.json").read_text())
catalog, report, cached = metadata["parts"], [], {}
generated = set()
preview_material = bpy.data.materials.new("Preview")
preview_material.diffuse_color = (0.35, 0.42, 0.5, 1)

for row in rows:
    source = row["source_path"]
    if not source.startswith("q-pack\\SHELL\\"):
        continue
    path = SOURCE.joinpath(*source.split("\\")[1:])
    name = path.stem.removeprefix(PREFIX)
    if not path.exists():
        raise FileNotFoundError(path)
    if source not in cached:
        cached[source] = (read_3mf(path) if path.suffix == ".3mf" else
                          hex_mesh(path) if name == "Clippard_Hex" else read_stl(path))
    mesh = cached[source]
    for copy in range(int(row["quantity"])):
        key = f"pack_{name.replace(' ', '_').replace('-', '_')}_{copy + 1:02d}"
        rotation, translation, alignment = placement(name, copy, mesh)
        obj = bpy.data.objects.new(key, mesh.copy())
        bpy.context.collection.objects.link(obj)
        obj.rotation_euler = rotation
        obj.location = translation
        obj.data.materials.append(preview_material)
        obj["part_key"] = key
        bounds = [obj.matrix_basis @ v.co for v in obj.data.vertices]
        low = [min(v[a] for v in bounds) for a in range(3)]
        high = [max(v[a] for v in bounds) for a in range(3)]
        center = [(a + b) / 2 for a, b in zip(low, high)]
        direction = (max(-1, min(1, center[0] / 150)),
                     max(-0.8, min(0.8, (center[1] - 170) / 300)),
                     0.2 if name.startswith("SynchGen") else 0.9)
        if key not in catalog:
            raise ValueError(f"Missing catalog entry: {key}")
        catalog[key].update(explode=direction, source=source, alignment=alignment)
        generated.add(key)
        report.append({"key": key, "source": source, "rotation_rad": rotation,
                       "translation_mm": translation, "bounds_mm": [low, high], "alignment": alignment})

if generated != set(catalog):
    raise ValueError("Pack geometry does not cover the planning manifest")
bpy.context.view_layer.update()
OUTPUT.mkdir(exist_ok=True)
(OUTPUT / "pack-parts.json").write_text(json.dumps(metadata, indent=2), encoding="utf-8")
(OUTPUT / "pack-alignment.json").write_text(json.dumps(report, indent=2), encoding="utf-8")
bpy.ops.export_scene.gltf(filepath=str(OUTPUT / "pack_assembly.glb"), export_format="GLB",
                          export_extras=True, export_cameras=False, export_lights=False)
print(f"Exported {len(generated)} pack pieces. Personal progress was not modified.")
