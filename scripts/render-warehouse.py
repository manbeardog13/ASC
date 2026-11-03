#!/usr/bin/env python3
"""Render exported repository geometry with Blender Cycles on CPU.

Example (bpy 4.5.x, Python 3.11):
  node scripts/export-warehouse.mjs --view upper-assembly --cutaway review \
      --output out/warehouse-review/geometry.json
  python scripts/render-warehouse.py --input out/warehouse-review/geometry.json \
      --output out/warehouse-review/upper.png --camera south --width 1800 --height 1100

No browser, image generation, database, customer data or geometry substitution.
Lighting, camera and ground are presentation-only additions. Mesh vertices and
instance transforms are imported unchanged from the exported THREE scene.
"""
import argparse
import base64
import hashlib
import json
import math
from pathlib import Path

import bpy
from mathutils import Matrix, Vector


def arguments():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--input', required=True, type=Path)
    parser.add_argument('--output', required=True, type=Path)
    parser.add_argument('--blend', type=Path)
    parser.add_argument('--camera', choices=['overview', 'south', 'west', 'plan'], default='overview')
    parser.add_argument('--lighting', choices=['studio', 'dusk'], default='studio')
    parser.add_argument('--opaque-walls', action='store_true', help='Render actual wall meshes opaque for a legible structure review; no mesh changes')
    parser.add_argument('--width', type=int, default=1600)
    parser.add_argument('--height', type=int, default=1100)
    parser.add_argument('--samples', type=int, default=48)
    return parser.parse_args()


def main():
    args = arguments()
    source_bytes = args.input.read_bytes()
    data = json.loads(source_bytes)
    if data.get('format') != 'asc-three-offline-geometry-1':
        raise ValueError('Expected actual ASC geometry export')
    if not (256 <= args.width <= 4096 and 256 <= args.height <= 4096):
        raise ValueError('Render dimensions must be between 256 and 4096')
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    scene.render.engine = 'CYCLES'
    scene.cycles.device = 'CPU'
    scene.cycles.samples = max(1, min(256, args.samples))
    scene.cycles.use_denoising = True
    scene.cycles.max_bounces = 8
    scene.cycles.transparent_max_bounces = 12
    scene.render.resolution_x = args.width
    scene.render.resolution_y = args.height
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = 'PNG'
    scene.render.image_settings.color_mode = 'RGBA'
    scene.render.film_transparent = False
    scene.view_settings.view_transform = 'AgX'
    scene.view_settings.look = 'AgX - Medium High Contrast'
    dusk = args.lighting == 'dusk'
    scene.view_settings.exposure = .45 if not dusk else .65
    scene.world = bpy.data.worlds.new('Dusk environment' if dusk else 'Neutral studio')
    scene.world.use_nodes = True
    scene.world.node_tree.nodes['Background'].inputs['Color'].default_value = (.075, .12, .22, 1) if dusk else (.77, .81, .84, 1)
    scene.world.node_tree.nodes['Background'].inputs['Strength'].default_value = .22 if dusk else .5

    images = {}
    for texture in data.get('textures', []):
        # Blender loads the exact supplied alpha silhouette, never generated text.
        texture_path = args.input.parent / f"source-texture-{texture['sourceSha256'][:16]}.png"
        texture_path.write_bytes(base64.b64decode(texture['dataBase64'], validate=True))
        image = bpy.data.images.load(str(texture_path.resolve()), check_existing=True)
        image.pack()
        images[texture['id']] = image
    opaque_wall_materials = {item['material'] for item in data['objects'] if item.get('metadata', {}).get('kind') == 'wall'} if args.opaque_walls else set()

    surfaces = {}
    for item in data['materials']:
        material = bpy.data.materials.new(f"Source material {item['id']}")
        material.use_nodes = True
        shader = material.node_tree.nodes.get('Principled BSDF')
        shader.inputs['Base Color'].default_value = (*item['color'], 1)
        shader.inputs['Roughness'].default_value = item['roughness']
        shader.inputs['Metallic'].default_value = item['metalness']
        opacity = 1 if item['id'] in opaque_wall_materials else item['opacity']
        shader.inputs['Alpha'].default_value = opacity
        shader.inputs['Emission Color'].default_value = (*item['emissive'], 1)
        shader.inputs['Emission Strength'].default_value = item['emissiveIntensity']
        shader.inputs['Coat Weight'].default_value = item.get('clearcoat', 0)
        shader.inputs['Coat Roughness'].default_value = item.get('clearcoatRoughness', 0)
        if item.get('unlit'):
            shader.inputs['Emission Color'].default_value = (*item['color'], 1)
            shader.inputs['Emission Strength'].default_value = 1
        if item.get('map') in images:
            tex = material.node_tree.nodes.new('ShaderNodeTexImage')
            tex.image = images[item['map']]
            if not item.get('mapAlphaOnly'):
                material.node_tree.links.new(tex.outputs['Color'], shader.inputs['Base Color'])
            multiply = material.node_tree.nodes.new('ShaderNodeMath')
            multiply.operation = 'MULTIPLY'
            multiply.inputs[1].default_value = opacity
            material.node_tree.links.new(tex.outputs['Alpha'], multiply.inputs[0])
            material.node_tree.links.new(multiply.outputs[0], shader.inputs['Alpha'])
        # A shader normal bevel reveals edges without changing any mesh geometry.
        bevel = material.node_tree.nodes.new('ShaderNodeBevel')
        bevel.inputs['Radius'].default_value = .012
        bevel.samples = 3
        material.node_tree.links.new(bevel.outputs['Normal'], shader.inputs['Normal'])
        surfaces[item['id']] = material

    # THREE is y-up; Blender is z-up. This is a rigid coordinate conversion.
    conversion = Matrix(((1, 0, 0, 0), (0, 0, -1, 0), (0, 1, 0, 0), (0, 0, 0, 1)))
    geometry_cache = {}
    for index, item in enumerate(data['objects']):
        key = (item['geometry'], item['material'])
        if key not in geometry_cache:
            raw = data['geometries'][item['geometry']]
            mesh = bpy.data.meshes.new(f"Source geometry {raw['id']} / material {item['material']}")
            mesh.from_pydata(raw['vertices'], [], raw['faces'])
            mesh.materials.append(surfaces[item['material']])
            mesh.update()
            if raw.get('uvs'):
                uv_layer = mesh.uv_layers.new(name='Source UV')
                for polygon in mesh.polygons:
                    for loop_index in polygon.loop_indices:
                        uv_layer.data[loop_index].uv = raw['uvs'][mesh.loops[loop_index].vertex_index]
            if raw['type'] in ['SphereGeometry', 'CylinderGeometry', 'CapsuleGeometry', 'LatheGeometry', 'TorusGeometry']:
                for polygon in mesh.polygons:
                    polygon.use_smooth = True
            geometry_cache[key] = mesh
        obj = bpy.data.objects.new(item['name'] or f'Source mesh {index}', geometry_cache[key])
        scene.collection.objects.link(obj)
        values = item['matrix']  # THREE stores column-major matrices.
        source_matrix = Matrix(tuple(tuple(values[column * 4 + row] for column in range(4)) for row in range(4)))
        obj.matrix_world = conversion @ source_matrix
        obj['source_object_index'] = index
        obj['source_geometry_id'] = item['geometry']

    minimum, maximum = data['bounds']['min'], data['bounds']['max']
    centre = Vector(((minimum[0] + maximum[0]) / 2, -(minimum[2] + maximum[2]) / 2, (minimum[1] + maximum[1]) / 2))
    span = max(maximum[0] - minimum[0], maximum[2] - minimum[2])
    bpy.ops.mesh.primitive_plane_add(size=span * 5, location=(centre.x, centre.y, minimum[1] - .015))
    ground = bpy.context.object
    ground.name = 'Presentation ground · not building geometry'
    surface = bpy.data.materials.new('Warm neutral presentation ground')
    surface.use_nodes = True
    surface.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = (.115, .13, .16, 1) if dusk else (.70, .69, .66, 1)
    surface.node_tree.nodes['Principled BSDF'].inputs['Roughness'].default_value = .95
    ground.data.materials.append(surface)

    def aim(obj, target):
        obj.rotation_euler = (Vector(target) - obj.location).to_track_quat('-Z', 'Y').to_euler()

    def light(name, offset, power, size, color):
        lamp = bpy.data.lights.new(name, 'AREA')
        lamp.energy = power
        lamp.shape = 'DISK'
        lamp.size = size
        lamp.color = color
        obj = bpy.data.objects.new(name, lamp)
        scene.collection.objects.link(obj)
        obj.location = centre + Vector(offset)
        aim(obj, centre)

    if dusk:
        light('Warm facade presentation light', (-24, -8, 16), 3300, 15, (1, .62, .32))
        light('Blue hour sky', (14, 12, 30), 5000, 28, (.38, .58, 1))
        light('Soft evening rim', (3, -28, 15), 2000, 18, (1, .76, .52))
    else:
        light('Large soft key', (-24, -18, 34), 10000, 22, (1, .91, .8))
        light('Sky fill', (22, -8, 22), 6500, 18, (.80, .88, 1))
        light('Rear soft light', (4, 25, 28), 8000, 16, (1, .95, .87))
    camera_data = bpy.data.cameras.new('Actual geometry review camera')
    camera = bpy.data.objects.new(camera_data.name, camera_data)
    scene.collection.objects.link(camera)
    scene.camera = camera
    camera_data.type = 'ORTHO'
    camera_data.lens = 48
    camera_data.clip_end = 1000
    if args.camera == 'west':
        camera.location = centre + Vector((-span * 1.8, -span * .18, span * .38))
        camera_data.ortho_scale = span * 1.2
    elif args.camera == 'plan':
        camera.location = centre + Vector((0, -.001, span * 2))
        camera_data.ortho_scale = span * 1.44
    elif args.camera == 'south':
        camera.location = centre + Vector((0, -span * 1.45, span * .84))
        camera_data.ortho_scale = span * 1.35
    else:
        camera.location = centre + Vector((-span * 1.05, -span * 1.35, span * 1.28))
        camera_data.ortho_scale = span * 1.62
    aim(camera, centre)
    if args.camera == 'south':
        # Fit the unchanged visible geometry at the reference's lower angle.
        # Camera framing alone must not require stretching the rooms.
        inverse_rotation = camera.rotation_euler.to_quaternion().inverted()
        corners = [inverse_rotation @ (Vector((x, -z, y)) - centre)
                   for x in (minimum[0], maximum[0])
                   for y in (minimum[1], maximum[1])
                   for z in (minimum[2], maximum[2])]
        projected_width = max(point.x for point in corners) - min(point.x for point in corners)
        projected_height = max(point.y for point in corners) - min(point.y for point in corners)
        camera_data.ortho_scale = max(projected_width, projected_height * args.width / args.height) * 1.14
    args.output.parent.mkdir(parents=True, exist_ok=True)
    scene.render.filepath = str(args.output.resolve())
    if args.blend:
        args.blend.parent.mkdir(parents=True, exist_ok=True)
        bpy.ops.wm.save_as_mainfile(filepath=str(args.blend.resolve()))
    bpy.ops.render.render(write_still=True)
    receipt = {
        'renderer': f'Blender {bpy.app.version_string} Cycles', 'device': 'CPU',
        'geometrySource': data['source'], 'sourceSha256': data['sourceSha256'],
        'exportSha256': hashlib.sha256(source_bytes).hexdigest(), 'objectCount': len(data['objects']),
        'camera': args.camera, 'dimensions': [args.width, args.height], 'samples': scene.cycles.samples,
        'lighting': args.lighting, 'presentationOverrides': ['Actual wall opacity set to 1; geometry unchanged'] if args.opaque_walls else [],
        'view': data['view'], 'cutaway': data['cutaway'], 'inventory': data['inventory'],
        'integrationReady': data.get('topology', {}).get('integrationReady'),
        'unresolvedJoins': data.get('topology', {}).get('unresolvedJoins', []),
        'staffIllustrative': data['staffIllustrative'], 'output': str(args.output.resolve()),
        'limitations': data['notes'],
    }
    args.output.with_suffix('.json').write_text(json.dumps(receipt, indent=2) + '\n')
    print(json.dumps(receipt))


if __name__ == '__main__':
    main()
