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
args = parser.parse_args(sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else [])
SOURCE = args.source.resolve()
OUTPUT = ROOT / "assets"
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
    "Dale_RH-50", "Booster_Plug_L_XL_XXL", "ION_ARM_CAP_L_XL_XXL-GB1",
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


def placement(name, copy, mesh):
    rotation = (0, 0, 0)
    note = "Source CAD coordinates / matched assembly-layout offset."
    if name in TRANSLATIONS:
        return rotation, TRANSLATIONS[name], note
    if name in NATIVE:
        return rotation, (0, 0, 0), note
    if name == "EDA_Disks-Flat_x2":
        return rotation, (150 + copy * 50, 450, 0), "Top-shell disk placement; dry-fit pending."
    if name == "Cyclotron_Window_Top_x2_L_XL_XXL":
        return rotation, ((0, 0, 0) if copy == 0 else (-104.89, 0, 0)), note
    if name == "Cyclotron_Window_Bottom_x2_L_XL_XXL":
        return rotation, ((0, 0, 0) if copy == 0 else (78.25, 0, 0)), note
    if name == "Clamp_X2":
        return (0, 0, copy * math.pi), (0, 0, 0), "Illustrative second-clamp routing; dry-fit pending."
    if name == "Sage-RH-25":
        return rotation, (-350, 0, 0), "Booster side detail; dry-fit pending."
    if name == "Injectors_L_XL_XXL_GB1":
        return rotation, (140.5, 353.5, 0), "Illustrative injector/bracket placement; dry-fit pending."
    if name == "HGA_L_XL_XXL":
        return rotation, (-145.3, 260, 52.965), "Illustrative HGA shoulder placement; dry-fit pending."
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
        "Booster_Frame_L_XL_XXL_GB1": (rotation, (-79, 361, 121.5)),
        "Powercell_Lens": ((0, math.pi / 2, 0), (-184, 322, 50)),
        "PPD_Type_1": ((math.pi / 2, 0, 0), (-79, 218, 108)),
        "Shockmount_full_GB1": (rotation, (0, 0, 159.5)),
        "crank_knob": ((0, math.pi / 2, 0), (103.4, 444, 93)),
        "clippard_r331_cap_corrected": (rotation, (55.75, 177.92, 153.6)),
        "Clippard_Hex": (rotation, ((-150, 391, 140) if copy == 0 else (-11.21, 173.49, 140.45))),
        "Clippard_elbow_square": (rotation, (-132.65, 465, 229)),
        "legris_elbow_GEN1_full_body": ((math.pi / 2, 0, 0),
                                      [(-161, 390, 128), (105, -72, 109), (-145, 460, 205)]),
        "legris_elbow_GEN1_Nut": ((math.pi / 2, 0, 0),
                                [(-161, 395, 105), (105, -67, 86), (-145, 465, 182)]),
        "Legris_Straight": ((0, math.pi / 2, 0), (-18.8, 207 + copy * 27, 91)),
        "Adaptaflex_elbow_full_body": ((0, 0, math.pi / 2), (166, -140, 34)),
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
    return rotation, tuple(Vector(target) - anchor), "Illustrative detail placement / provisional variant; verify during dry-fit."


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
