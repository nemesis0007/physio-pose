import bpy
import os
import sys

source = os.path.abspath(sys.argv[-2])
target = os.path.abspath(sys.argv[-1])

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=source)

for obj in bpy.context.scene.objects:
    if obj.type == "MESH":
        for polygon in obj.data.polygons:
            polygon.use_smooth = True
        for material in obj.data.materials:
            if material and material.use_nodes:
                material.diffuse_color[3] = 1.0
                material.roughness = max(0.32, min(material.roughness, 0.72))
                material.metallic = 0.0

armatures = [obj for obj in bpy.context.scene.objects if obj.type == "ARMATURE"]
if not armatures:
    raise RuntimeError("The source character does not contain a skeletal rig.")

os.makedirs(os.path.dirname(target), exist_ok=True)
bpy.ops.export_scene.gltf(
    filepath=target,
    export_format="GLB",
    export_apply=False,
    export_animations=False,
    export_skins=True,
    export_morph=False,
    export_materials="EXPORT",
    export_image_format="JPEG",
    export_image_quality=78,
    export_draco_mesh_compression_enable=False,
    export_yup=True,
)
print(f"Exported optimized rig to {target}")
