"""Rebuild the 39-piece wand preview from an external Q-Pack MK4 checkout."""

import argparse
import json
import sys
from pathlib import Path

import bpy

ROOT = Path(__file__).resolve().parent.parent
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("--source", type=Path, required=True)
args = parser.parse_args(sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else [])
source = args.source.resolve()
manifest = json.loads((ROOT / "scripts" / "build-manifest.json").read_text())
bpy.ops.wm.read_factory_settings(use_empty=True)
for part in manifest["wand"]:
    path = source.joinpath(*part["source_path"].split("\\")[1:])
    if not path.is_file():
        raise FileNotFoundError(path)
    bpy.ops.wm.stl_import(filepath=str(path))
    obj = bpy.context.selected_objects[0]
    obj.name = part["key"]
    obj["part_key"] = part["key"]
    obj.rotation_euler = part["rotation_rad"]
    obj.location = part["translation_mm"]
    mat = bpy.data.materials.new(part["key"] + "_preview")
    mat.diffuse_color = (0.5, 0.5, 0.55, 1)
    obj.data.materials.append(mat)
bpy.ops.export_scene.gltf(filepath=str(ROOT / "assets" / "wand_assembly.glb"),
                          export_format="GLB", export_extras=True,
                          export_cameras=False, export_lights=False)
print(f"Exported {len(manifest['wand'])} wand pieces. Personal progress was not modified.")
