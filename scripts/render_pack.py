"""Render a finished-look pack reference without changing geometry or progress."""

import argparse
import math
import sys
from pathlib import Path

import bpy
from mathutils import Vector


parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("--model", type=Path, required=True)
parser.add_argument("--output", type=Path, required=True)
parser.add_argument("--view", choices=("three-quarter", "front"), default="three-quarter")
args = parser.parse_args(sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else [])
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(args.model.resolve()))
scene = bpy.context.scene
pieces = [obj for obj in scene.objects if obj.type == "MESH"]
if not pieces or any(not obj.get("part_key", obj.name).startswith("pack_") for obj in pieces):
    raise ValueError("Expected an assembled pack GLB with pack_ part identities")


def material(name, color, metal=0, roughness=.4):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = (*color, 1)
    bsdf.inputs["Metallic"].default_value = metal
    bsdf.inputs["Roughness"].default_value = roughness
    return mat


black = material("Black painted shell", (.024, .028, .033), roughness=.42)
rubber = material("Dark shockmount finish", (.012, .014, .017), roughness=.7)
silver = material("Metal-look fittings", (.48, .51, .55), .75, .28)
brass = material("Brass-look fittings", (.45, .29, .085), .7, .3)
blue = material("Illustrative blue-lit powercell appearance", (.015, .11, .48), roughness=.25)
red = material("Static red cyclotron lenses", (.48, .012, .018), roughness=.25)
resistor = material("Gold resistor finish", (.36, .20, .055), .45, .4)

for obj in pieces:
    key = obj.get("part_key", obj.name)
    mat = black
    if key.startswith("pack_Cyclotron_Window_Lens_"):
        mat = red
    elif key.startswith("pack_Powercell_Lens_"):
        mat = blue
    elif key.startswith(("pack_Shockmount_", "pack_Bumper_Spacer_")):
        mat = rubber
    elif key.startswith(("pack_Clippard_Hex_", "pack_Clippard_elbow_square_", "pack_Legris_Straight_")):
        mat = brass
    elif key.startswith(("pack_clippard_", "pack_legris_elbow_", "pack_Injectors_", "pack_Clamp_")):
        mat = silver
    elif key.startswith(("pack_Dale_", "pack_PH_25_", "pack_Sage_")):
        mat = resistor
    obj.data.materials.clear()
    obj.data.materials.append(mat)

# The source assembly lies on its back: Y runs along the pack, Z faces outward.
upright = bpy.data.objects.new("Upright presentation only", None)
scene.collection.objects.link(upright)
for obj in [obj for obj in scene.objects if obj != upright and obj.parent is None]:
    obj.parent = upright
upright.rotation_euler.x = math.pi / 2
bpy.context.view_layer.update()
bounds = [obj.matrix_world @ Vector(corner) for obj in pieces for corner in obj.bound_box]
low = Vector(tuple(min(p[a] for p in bounds) for a in range(3)))
high = Vector(tuple(max(p[a] for p in bounds) for a in range(3)))
target = (low + high) / 2

scene.world = bpy.data.worlds.new("Pack studio")
scene.world.use_nodes = True
scene.world.node_tree.nodes["Background"].inputs[0].default_value = (.065, .075, .095, 1)
scene.world.node_tree.nodes["Background"].inputs[1].default_value = .6
for offset, energy, size in [
    ((-450, -650, 650), 6500000, 500),
    ((500, -350, 200), 4000000, 400),
    ((0, 250, 550), 7000000, 400),
]:
    bpy.ops.object.light_add(type="AREA", location=target + Vector(offset))
    light = bpy.context.object
    light.data.energy = energy
    light.data.shape = "DISK"
    light.data.size = size
    light.rotation_euler = (target-light.location).to_track_quat("-Z", "Y").to_euler()

camera_offset = (0, -1300, 0) if args.view == "front" else (-650, -1300, 420)
bpy.ops.object.camera_add(location=target + Vector(camera_offset))
camera = bpy.context.object
camera.rotation_euler = (target-camera.location).to_track_quat("-Z", "Y").to_euler()
camera.data.type = "ORTHO"
camera.data.lens = 50
camera.data.clip_end = 10000
scene.camera = camera
scene.render.resolution_x = 1500
scene.render.resolution_y = 1800
scene.render.resolution_percentage = 100
bpy.context.view_layer.update()
camera_bounds = [camera.matrix_world.inverted() @ p for p in bounds]
width = max(p.x for p in camera_bounds) - min(p.x for p in camera_bounds)
height = max(p.y for p in camera_bounds) - min(p.y for p in camera_bounds)
camera.data.ortho_scale = max(height, width * 1800 / 1500) * 1.15
scene.render.engine = "CYCLES"
scene.cycles.samples = 48
scene.cycles.use_denoising = True
scene.render.image_settings.file_format = "PNG"
scene.render.filepath = str(args.output.resolve())
scene.view_settings.view_transform = "AgX"
bpy.ops.render.render(write_still=True)
print(f"Rendered {len(pieces)} pack pieces; presentation materials only. Model and progress files unchanged.")
