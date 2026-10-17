"""Render an assembled appearance reference, including an illustrative acrylic tube."""

import argparse
import math
import sys
from pathlib import Path

import bpy
from mathutils import Vector

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("--model", type=Path, required=True)
parser.add_argument("--output", type=Path, required=True)
args = parser.parse_args(sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else [])
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(args.model.resolve()))
scene = bpy.context.scene

def material(name, color, metal=0, roughness=.4):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = (*color, 1)
    bsdf.inputs["Metallic"].default_value = metal
    bsdf.inputs["Roughness"].default_value = roughness
    return mat

black = material("Black painted body", (.022, .026, .032))
grip = material("Dark grip finish", (.045, .028, .019), roughness=.55)
silver = material("Metal-look finish", (.5, .53, .57), .7, .27)
brass = material("Brass-look finish", (.42, .29, .10), .65, .3)
grey = material("Grey tip", (.17, .19, .21))
clear = material("Frosted acrylic reference", (.58, .78, .84), roughness=.3)
orange = material("Orange cover", (.85, .24, .015), roughness=.25)
red = material("Red cover", (.55, .018, .012), roughness=.25)
for obj in [o for o in scene.objects if o.type == "MESH"]:
    name = obj.name
    mat = black
    if name in {"front_Grip", "b_handle_01", "b_handle_02"}:
        mat = grip
    elif name in {"Metal_tip", "front_knob", "top_knob_V2", "heat_sink"}:
        mat = silver
    elif "knob" in name or name == "rear_fitting" or name.startswith("banjo"):
        mat = brass
    elif name == "Grey_tip":
        mat = grey
    elif name in {"hat_front", "long_hat_inside_body"}:
        mat = orange
    elif name == "long_sloblow_red":
        mat = red
    elif name in {"hat_body", "long_sloblow_clear"}:
        mat = clear
    obj.data.materials.clear()
    obj.data.materials.append(mat)

# An open outer surface avoids inventing the tube's unknown inside diameter.
bpy.ops.mesh.primitive_cylinder_add(vertices=128, radius=22.225/2, depth=152.4, end_fill_type="NOTHING",
    location=(15.78, 196.7, 22.22), rotation=(math.pi/2, 0, 0))
tube = bpy.context.object
tube.name = "Non-printed acrylic reference"
tube.data.materials.append(clear)
for polygon in tube.data.polygons:
    polygon.use_smooth = len(polygon.vertices) == 4

scene.world = bpy.data.worlds.new("Studio")
scene.world.use_nodes = True
scene.world.node_tree.nodes["Background"].inputs[0].default_value = (.065, .075, .095, 1)
scene.world.node_tree.nodes["Background"].inputs[1].default_value = .7
for location, energy, size in [((0, 80, 450), 4500000, 400),
                               ((-250, -100, 180), 2500000, 300),
                               ((180, 250, 240), 4000000, 300)]:
    bpy.ops.object.light_add(type="AREA", location=location)
    light = bpy.context.object
    light.data.energy = energy
    light.data.shape = "DISK"
    light.data.size = size
    light.rotation_euler = (Vector((0, 50, 30))-light.location).to_track_quat("-Z", "Y").to_euler()
bpy.ops.object.camera_add(location=(-360, 500, 245))
camera = bpy.context.object
camera.rotation_euler = (Vector((0, 45, 24))-camera.location).to_track_quat("-Z", "Y").to_euler()
camera.data.type = "ORTHO"
camera.data.ortho_scale = 610
scene.camera = camera
scene.render.engine = "CYCLES"
scene.cycles.samples = 32
scene.cycles.use_denoising = True
scene.render.resolution_x = 1800
scene.render.resolution_y = 1000
scene.render.resolution_percentage = 100
scene.render.image_settings.file_format = "PNG"
scene.render.filepath = str(args.output.resolve())
scene.view_settings.view_transform = "AgX"
bpy.ops.render.render(write_still=True)
