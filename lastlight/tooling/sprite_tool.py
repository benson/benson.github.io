#!/usr/bin/env python3
"""Deterministic, manifest-driven Lastlight sprite atlas tooling."""

from __future__ import annotations

import argparse
import hashlib
import io
import json
import re
import subprocess
import sys
from pathlib import Path

from PIL import Image, ImageDraw, __version__ as PILLOW_VERSION


SCHEMA = "lastlight.sprite-atlas.v1"
SAFE_ID = re.compile(r"^[a-z][a-z0-9-]{0,63}$")
SAFE_PATH = re.compile(r"^(?:assets|themes)/[a-z0-9/_-]+\.(?:png|js)$")
SHA256 = re.compile(r"^[0-9a-f]{64}$")
CANONICAL_DIRECTIONS = ["south", "west", "north", "east"]
REQUIRED_CLIPS = ["idle", "run", "dash", "castE", "castR", "hurt", "down", "revive", "victory"]


class SpriteToolError(Exception):
    pass


def exact(value, allowed, label):
    if not isinstance(value, dict):
        raise SpriteToolError(f"{label} must be an object")
    unknown = sorted(set(value) - set(allowed))
    if unknown:
        raise SpriteToolError(f"{label} contains unknown fields: {', '.join(unknown)}")
    return value


def require_keys(value, required, label):
    missing = [key for key in required if key not in value]
    if missing:
        raise SpriteToolError(f"{label} is missing fields: {', '.join(missing)}")


def integer(value, minimum, maximum, label):
    if isinstance(value, bool) or not isinstance(value, int) or not minimum <= value <= maximum:
        raise SpriteToolError(f"{label} must be an integer from {minimum} to {maximum}")
    return value


def number(value, minimum, maximum, label):
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not minimum <= value <= maximum:
        raise SpriteToolError(f"{label} must be finite and between {minimum} and {maximum}")
    return value


def vector(value, length, minimum, maximum, label, integers=False):
    if not isinstance(value, list) or len(value) != length:
        raise SpriteToolError(f"{label} must contain {length} values")
    for index, item in enumerate(value):
        (integer if integers else number)(item, minimum, maximum, f"{label}[{index}]")
    return value


def safe_id(value, label):
    if not isinstance(value, str) or not SAFE_ID.fullmatch(value):
        raise SpriteToolError(f"{label} must be a lowercase kebab-case id")
    return value


def safe_path(value, label):
    if not isinstance(value, str) or not SAFE_PATH.fullmatch(value) or ".." in value:
        raise SpriteToolError(f"{label} must be a lowercase relative PNG/JS path")
    return value


def sha256_bytes(data):
    return hashlib.sha256(data).hexdigest()


def sha256_file(path):
    return sha256_bytes(path.read_bytes())


def canonical_json(value, pretty=False):
    if pretty:
        return (json.dumps(value, sort_keys=True, indent=2, ensure_ascii=True) + "\n").encode("utf-8")
    return (json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=True) + "\n").encode("utf-8")


def load_manifest(path):
    try:
        manifest = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        raise SpriteToolError(f"Cannot read manifest: {error}") from error
    validate_manifest(manifest)
    return manifest


def validate_manifest(manifest):
    exact(manifest, ["schema", "tool", "theme", "atlases"], "manifest")
    require_keys(manifest, ["schema", "tool", "theme", "atlases"], "manifest")
    if manifest["schema"] != SCHEMA:
        raise SpriteToolError(f"manifest.schema must be {SCHEMA}")

    tool = exact(manifest["tool"], ["name", "version", "pillowVersion"], "manifest.tool")
    require_keys(tool, ["name", "version", "pillowVersion"], "manifest.tool")
    if tool["name"] != "lastlight-sprite-tool" or not re.fullmatch(r"\d+\.\d+\.\d+", tool["version"]):
        raise SpriteToolError("manifest.tool name or version is invalid")
    if tool["pillowVersion"] != PILLOW_VERSION:
        raise SpriteToolError(f"Pillow {tool['pillowVersion']} is required; found {PILLOW_VERSION}")

    theme = exact(manifest["theme"], ["id", "module", "requiredAnimatedSpecialists"], "manifest.theme")
    require_keys(theme, ["id", "module", "requiredAnimatedSpecialists"], "manifest.theme")
    safe_id(theme["id"], "manifest.theme.id")
    safe_path(theme["module"], "manifest.theme.module")
    required = theme["requiredAnimatedSpecialists"]
    if not isinstance(required, list) or not required or len(required) != len(set(required)):
        raise SpriteToolError("manifest.theme.requiredAnimatedSpecialists must be a unique nonempty list")
    for index, specialist in enumerate(required):
        safe_id(specialist, f"manifest.theme.requiredAnimatedSpecialists[{index}]")

    atlases = manifest["atlases"]
    if not isinstance(atlases, list) or not atlases:
        raise SpriteToolError("manifest.atlases must be a nonempty list")
    atlas_ids, specialists, outputs = set(), set(), set()
    for index, atlas in enumerate(atlases):
        validate_atlas(atlas, f"manifest.atlases[{index}]")
        if atlas["id"] in atlas_ids or atlas["specialist"] in specialists or atlas["output"]["path"] in outputs:
            raise SpriteToolError("atlas ids, specialists, and output paths must be unique")
        atlas_ids.add(atlas["id"]); specialists.add(atlas["specialist"]); outputs.add(atlas["output"]["path"])
    if specialists != set(required):
        raise SpriteToolError("atlas specialist coverage must exactly match requiredAnimatedSpecialists")


def validate_atlas(atlas, label):
    fields = ["id", "specialist", "source", "output", "layout", "render", "clips", "processing"]
    exact(atlas, fields, label); require_keys(atlas, fields, label)
    safe_id(atlas["id"], f"{label}.id"); safe_id(atlas["specialist"], f"{label}.specialist")

    for key, modes in [("source", ["RGB", "RGBA"]), ("output", ["RGBA"])]:
        record = exact(atlas[key], ["path", "sha256", "width", "height", "mode"], f"{label}.{key}")
        require_keys(record, ["path", "sha256", "width", "height", "mode"], f"{label}.{key}")
        safe_path(record["path"], f"{label}.{key}.path")
        if not isinstance(record["sha256"], str) or not SHA256.fullmatch(record["sha256"]):
            raise SpriteToolError(f"{label}.{key}.sha256 must be lowercase SHA-256")
        integer(record["width"], 1, 8192, f"{label}.{key}.width")
        integer(record["height"], 1, 8192, f"{label}.{key}.height")
        if record["mode"] not in modes:
            raise SpriteToolError(f"{label}.{key}.mode must be one of {modes}")

    layout = exact(atlas["layout"], ["columns", "rows", "cellWidth", "cellHeight", "directions", "states", "frames", "unusedCells"], f"{label}.layout")
    require_keys(layout, ["columns", "rows", "cellWidth", "cellHeight", "directions", "states", "frames", "unusedCells"], f"{label}.layout")
    columns = integer(layout["columns"], 1, 16, f"{label}.layout.columns")
    rows = integer(layout["rows"], 1, 32, f"{label}.layout.rows")
    cell_width = integer(layout["cellWidth"], 1, 2048, f"{label}.layout.cellWidth")
    cell_height = integer(layout["cellHeight"], 1, 2048, f"{label}.layout.cellHeight")
    if atlas["output"]["width"] != columns * cell_width or atlas["output"]["height"] != rows * cell_height:
        raise SpriteToolError(f"{label}.output dimensions must equal the uniform layout grid")
    if layout["directions"] != CANONICAL_DIRECTIONS or columns != len(CANONICAL_DIRECTIONS):
        raise SpriteToolError(f"{label}.layout.directions must be {CANONICAL_DIRECTIONS}")

    states = layout["states"]
    if not isinstance(states, list) or len(states) != rows:
        raise SpriteToolError(f"{label}.layout.states must define one state for each row")
    state_rows = {}
    for index, state in enumerate(states):
        exact(state, ["id", "row"], f"{label}.layout.states[{index}]"); require_keys(state, ["id", "row"], f"{label}.layout.states[{index}]")
        state_id = safe_id(state["id"], f"{label}.layout.states[{index}].id")
        row = integer(state["row"], 0, rows - 1, f"{label}.layout.states[{index}].row")
        if state_id in state_rows or row in state_rows.values(): raise SpriteToolError(f"{label}.layout.states has duplicates")
        state_rows[state_id] = row
    if [state["row"] for state in states] != list(range(rows)):
        raise SpriteToolError(f"{label}.layout.states must be row ordered")

    frames, occupied, frame_ids = layout["frames"], set(), set()
    if not isinstance(frames, list): raise SpriteToolError(f"{label}.layout.frames must be a list")
    for index, frame in enumerate(frames):
        frame_label = f"{label}.layout.frames[{index}]"
        exact(frame, ["id", "state", "direction", "cell", "sourceRect", "offset"], frame_label)
        require_keys(frame, ["id", "state", "direction", "cell", "sourceRect"], frame_label)
        safe_id(frame["state"], f"{frame_label}.state")
        if frame["direction"] not in CANONICAL_DIRECTIONS: raise SpriteToolError(f"{frame_label}.direction is invalid")
        expected_id = f"{frame['state']}.{frame['direction']}"
        if frame["id"] != expected_id: raise SpriteToolError(f"{frame_label}.id must be {expected_id}")
        cell = vector(frame["cell"], 2, 0, max(columns, rows), f"{frame_label}.cell", integers=True)
        if cell[0] >= columns or cell[1] >= rows or cell[1] != state_rows.get(frame["state"]) or cell[0] != CANONICAL_DIRECTIONS.index(frame["direction"]):
            raise SpriteToolError(f"{frame_label}.cell does not match state/direction ordering")
        rect = vector(frame["sourceRect"], 4, 0, 8192, f"{frame_label}.sourceRect", integers=True)
        if rect[2] < 1 or rect[3] < 1 or rect[0] + rect[2] > atlas["source"]["width"] or rect[1] + rect[3] > atlas["source"]["height"]:
            raise SpriteToolError(f"{frame_label}.sourceRect is outside the source")
        if rect[2] > cell_width or rect[3] > cell_height: raise SpriteToolError(f"{frame_label}.sourceRect exceeds its cell")
        offset = frame.get("offset", [0, 0])
        vector(offset, 2, 0, max(cell_width, cell_height), f"{frame_label}.offset", integers=True)
        if offset[0] + rect[2] > cell_width or offset[1] + rect[3] > cell_height:
            raise SpriteToolError(f"{frame_label}.sourceRect plus offset exceeds its cell")
        key = tuple(cell)
        if key in occupied or frame["id"] in frame_ids: raise SpriteToolError(f"{label}.layout.frames has duplicate ids or cells")
        occupied.add(key); frame_ids.add(frame["id"])
    if [frame["cell"] for frame in frames] != sorted((frame["cell"] for frame in frames), key=lambda cell: (cell[1], cell[0])):
        raise SpriteToolError(f"{label}.layout.frames must use deterministic row-major state/direction ordering")

    unused = layout["unusedCells"]
    if not isinstance(unused, list): raise SpriteToolError(f"{label}.layout.unusedCells must be a list")
    for index, cell in enumerate(unused):
        vector(cell, 2, 0, max(columns, rows), f"{label}.layout.unusedCells[{index}]", integers=True)
        key = tuple(cell)
        if cell[0] >= columns or cell[1] >= rows or key in occupied: raise SpriteToolError(f"{label}.layout.unusedCells is invalid")
        occupied.add(key)
    if occupied != {(column, row) for row in range(rows) for column in range(columns)}:
        raise SpriteToolError(f"{label}.layout must account for every cell exactly once")

    validate_render(atlas["render"], label)
    validate_clips(atlas["clips"], rows, label)
    validate_processing(atlas["processing"], atlas["source"]["mode"], label)


def validate_render(render, label):
    fields = ["anchor", "drawSize", "spriteBounds", "collisionOffset", "groundY", "shadow", "sockets"]
    exact(render, fields, f"{label}.render"); require_keys(render, fields, f"{label}.render")
    vector(render["anchor"], 2, 0, 1, f"{label}.render.anchor")
    vector(render["drawSize"], 2, 1, 2048, f"{label}.render.drawSize")
    vector(render["spriteBounds"], 4, -2048, 2048, f"{label}.render.spriteBounds")
    if render["spriteBounds"][2] <= 0 or render["spriteBounds"][3] <= 0: raise SpriteToolError(f"{label}.render.spriteBounds dimensions must be positive")
    vector(render["collisionOffset"], 2, -2048, 2048, f"{label}.render.collisionOffset")
    number(render["groundY"], -2048, 2048, f"{label}.render.groundY")
    vector(render["shadow"], 2, 0.01, 2048, f"{label}.render.shadow")
    sockets = exact(render["sockets"], ["muzzle"], f"{label}.render.sockets"); require_keys(sockets, ["muzzle"], f"{label}.render.sockets")
    muzzle = exact(sockets["muzzle"], ["distance", "vertical"], f"{label}.render.sockets.muzzle")
    require_keys(muzzle, ["distance", "vertical"], f"{label}.render.sockets.muzzle")
    number(muzzle["distance"], -2048, 2048, f"{label}.render.sockets.muzzle.distance")
    number(muzzle["vertical"], -2048, 2048, f"{label}.render.sockets.muzzle.vertical")


def validate_clips(clips, rows, label):
    if not isinstance(clips, dict) or list(clips) != REQUIRED_CLIPS:
        raise SpriteToolError(f"{label}.clips must define {REQUIRED_CLIPS} in order")
    for clip_id, clip in clips.items():
        clip_label = f"{label}.clips.{clip_id}"
        exact(clip, ["loop", "frames"], clip_label); require_keys(clip, ["loop", "frames"], clip_label)
        if not isinstance(clip["loop"], bool) or not isinstance(clip["frames"], list) or not clip["frames"]:
            raise SpriteToolError(f"{clip_label} loop/frames are invalid")
        for index, frame in enumerate(clip["frames"]):
            frame_label = f"{clip_label}.frames[{index}]"
            allowed = ["row", "ms", "scaleX", "scaleY", "offsetY", "rotation"]
            exact(frame, allowed, frame_label); require_keys(frame, ["row", "ms"], frame_label)
            integer(frame["row"], 0, rows - 1, f"{frame_label}.row")
            integer(frame["ms"], 1, 5000, f"{frame_label}.ms")
            for key in ["scaleX", "scaleY"]:
                if key in frame: number(frame[key], .1, 4, f"{frame_label}.{key}")
            if "offsetY" in frame: number(frame["offsetY"], -2048, 2048, f"{frame_label}.offsetY")
            if "rotation" in frame: number(frame["rotation"], -6.4, 6.4, f"{frame_label}.rotation")


def validate_processing(processing, source_mode, label):
    exact(processing, ["method", "chromaKey", "bleed", "edgePolicy", "png"], f"{label}.processing")
    require_keys(processing, ["method", "chromaKey", "bleed", "edgePolicy", "png"], f"{label}.processing")
    if processing["method"] not in ["copy", "chroma-key"]: raise SpriteToolError(f"{label}.processing.method is invalid")
    if processing["method"] == "copy" and source_mode != "RGBA": raise SpriteToolError(f"{label}.processing.copy requires RGBA source")
    chroma = processing["chromaKey"]
    if processing["method"] == "chroma-key":
        exact(chroma, ["color", "softStart", "softEnd", "minGreen"], f"{label}.processing.chromaKey")
        require_keys(chroma, ["color", "softStart", "softEnd", "minGreen"], f"{label}.processing.chromaKey")
        vector(chroma["color"], 3, 0, 255, f"{label}.processing.chromaKey.color", integers=True)
        number(chroma["softStart"], 0, 255, f"{label}.processing.chromaKey.softStart")
        number(chroma["softEnd"], 0, 255, f"{label}.processing.chromaKey.softEnd")
        number(chroma["minGreen"], 0, 255, f"{label}.processing.chromaKey.minGreen")
        if chroma["softEnd"] <= chroma["softStart"]: raise SpriteToolError(f"{label}.processing.chromaKey softEnd must exceed softStart")
    elif chroma is not None: raise SpriteToolError(f"{label}.processing.chromaKey must be null for copy")
    integer(processing["bleed"], 1, 64, f"{label}.processing.bleed")
    if processing["edgePolicy"] not in ["validate", "clear"]: raise SpriteToolError(f"{label}.processing.edgePolicy must be validate or clear")
    png = exact(processing["png"], ["compressLevel", "optimize"], f"{label}.processing.png")
    require_keys(png, ["compressLevel", "optimize"], f"{label}.processing.png")
    integer(png["compressLevel"], 0, 9, f"{label}.processing.png.compressLevel")
    if png["optimize"] is not False: raise SpriteToolError(f"{label}.processing.png.optimize must be false for stable encoding")


def resolve(root, relative):
    path = (root / relative).resolve()
    if root.resolve() not in path.parents:
        raise SpriteToolError(f"Path escapes Lastlight root: {relative}")
    return path


def verify_source(root, atlas):
    record = atlas["source"]
    path = resolve(root, record["path"])
    if not path.is_file(): raise SpriteToolError(f"Missing source: {record['path']}")
    actual_hash = sha256_file(path)
    if actual_hash != record["sha256"]: raise SpriteToolError(f"Source SHA-256 mismatch: {record['path']}")
    with Image.open(path) as image:
        if image.size != (record["width"], record["height"]) or image.mode != record["mode"]:
            raise SpriteToolError(f"Source dimensions/mode mismatch: {record['path']}")
        image.load()
        return image.copy()


def chroma_key(image, config):
    source = image.convert("RGB")
    output = Image.new("RGBA", source.size, (0, 0, 0, 0))
    key = config["color"]
    start = config["softStart"]
    end = config["softEnd"]
    min_green = config["minGreen"]
    source_pixels, output_pixels = source.load(), output.load()
    for y in range(source.height):
        for x in range(source.width):
            red, green, blue = source_pixels[x, y]
            dominance = green - max(red, blue)
            if green < min_green or dominance <= start:
                alpha = 255
            elif dominance >= end:
                alpha = 0
            else:
                alpha = round(255 * (end - dominance) / (end - start))
            if alpha <= 0:
                output_pixels[x, y] = (0, 0, 0, 0)
            elif alpha >= 255:
                output_pixels[x, y] = (red, green, blue, 255)
            else:
                channels = []
                for value, background in zip((red, green, blue), key):
                    recovered = round((value * 255 - background * (255 - alpha)) / alpha)
                    channels.append(max(0, min(255, recovered)))
                output_pixels[x, y] = (*channels, alpha)
    return output


def save_png_bytes(image, png):
    buffer = io.BytesIO()
    image.save(buffer, format="PNG", optimize=False, compress_level=png["compressLevel"])
    return buffer.getvalue()


def clear_edge_bleed(image, bleed):
    """Legacy sheet migration: make the declared cell gutter transparent."""
    alpha = image.getchannel("A")
    draw = ImageDraw.Draw(alpha)
    width, height = image.size
    draw.rectangle((0, 0, width - 1, bleed - 1), fill=0)
    draw.rectangle((0, height - bleed, width - 1, height - 1), fill=0)
    draw.rectangle((0, 0, bleed - 1, height - 1), fill=0)
    draw.rectangle((width - bleed, 0, width - 1, height - 1), fill=0)
    image.putalpha(alpha)
    return image


def alpha_bbox(image):
    return image.getchannel("A").getbbox()


def validate_built_atlas(image, atlas):
    layout, bleed = atlas["layout"], atlas["processing"]["bleed"]
    if image.mode != "RGBA" or image.size != (atlas["output"]["width"], atlas["output"]["height"]):
        raise SpriteToolError(f"Built atlas {atlas['id']} has wrong dimensions/mode")
    alpha = image.getchannel("A")
    extrema = alpha.getextrema()
    if extrema[0] != 0 or extrema[1] != 255:
        raise SpriteToolError(f"Built atlas {atlas['id']} must contain transparent and opaque pixels")
    hashes, frames_report = {}, []
    for frame in layout["frames"]:
        column, row = frame["cell"]
        box = (column * layout["cellWidth"], row * layout["cellHeight"], (column + 1) * layout["cellWidth"], (row + 1) * layout["cellHeight"])
        cell = image.crop(box); bounds = alpha_bbox(cell)
        if not bounds: raise SpriteToolError(f"Frame {frame['id']} is fully transparent")
        if bounds[0] < bleed or bounds[1] < bleed or layout["cellWidth"] - bounds[2] < bleed or layout["cellHeight"] - bounds[3] < bleed:
            raise SpriteToolError(f"Frame {frame['id']} violates {bleed}px transparent bleed")
        digest = sha256_bytes(cell.tobytes())
        if digest in hashes: raise SpriteToolError(f"Duplicate frame pixels: {hashes[digest]} and {frame['id']}")
        hashes[digest] = frame["id"]
        frames_report.append({"id": frame["id"], "cell": frame["cell"], "alphaBounds": list(bounds), "pixelSha256": digest})
    for cell in layout["unusedCells"]:
        column, row = cell
        box = (column * layout["cellWidth"], row * layout["cellHeight"], (column + 1) * layout["cellWidth"], (row + 1) * layout["cellHeight"])
        if alpha_bbox(image.crop(box)): raise SpriteToolError(f"Unused cell {cell} is not transparent")
    return frames_report


def build_atlas(root, atlas):
    source = verify_source(root, atlas)
    layout, processing = atlas["layout"], atlas["processing"]
    output = Image.new("RGBA", (atlas["output"]["width"], atlas["output"]["height"]), (0, 0, 0, 0))
    for frame in layout["frames"]:
        x, y, width, height = frame["sourceRect"]
        cell = source.crop((x, y, x + width, y + height))
        cell = chroma_key(cell, processing["chromaKey"]) if processing["method"] == "chroma-key" else cell.convert("RGBA")
        if processing["edgePolicy"] == "clear": cell = clear_edge_bleed(cell, processing["bleed"])
        column, row = frame["cell"]
        offset_x, offset_y = frame.get("offset", [0, 0])
        output.alpha_composite(cell, (column * layout["cellWidth"] + offset_x, row * layout["cellHeight"] + offset_y))
    frames_report = validate_built_atlas(output, atlas)
    encoded = save_png_bytes(output, processing["png"])
    return output, encoded, frames_report


def verify_theme_coverage(root, manifest, compare_metadata=True):
    theme_path = resolve(root, manifest["theme"]["module"])
    if not theme_path.is_file(): raise SpriteToolError("Theme module is missing")
    module_specifier = f"./{manifest['theme']['module']}"
    node_script = f'import {{ LASTLIGHT_THEME }} from {json.dumps(module_specifier)}; process.stdout.write(JSON.stringify(LASTLIGHT_THEME.animations.specialists));'
    try:
        completed = subprocess.run(["node", "--input-type=module", "--eval", node_script], cwd=root, check=True, capture_output=True, text=True)
        runtime_animations = json.loads(completed.stdout)
    except (OSError, subprocess.CalledProcessError, json.JSONDecodeError) as error:
        raise SpriteToolError(f"Cannot inspect runtime theme animations: {error}") from error
    required_specialists = set(manifest["theme"]["requiredAnimatedSpecialists"])
    discovered = {
        (
            specialist,
            (
                animation.get("atlas", {}).get("src")
                if isinstance(animation, dict) and isinstance(animation.get("atlas"), dict)
                else animation.get("atlas") if isinstance(animation, dict) else None
            ),
        )
        for specialist, animation in runtime_animations.items()
        if specialist in required_specialists and isinstance(animation, dict) and animation.get("atlas", {}).get("available", True)
    }
    expected = {(atlas["specialist"], atlas["output"]["path"]) for atlas in manifest["atlases"]}
    if discovered != expected:
        raise SpriteToolError(f"Theme animation coverage mismatch: expected {sorted(expected)}, found {sorted(discovered)}")
    if not compare_metadata:
        return {"module": manifest["theme"]["module"], "animatedSpecialists": sorted(item[0] for item in discovered)}
    for atlas in manifest["atlases"]:
        render = atlas["render"]
        runtime = runtime_animations.get(atlas["specialist"], {})
        runtime_atlas = runtime.get("atlas", {})
        bindings = runtime.get("bindings", {})
        runtime_states = runtime.get("states", {})
        normalized_states = {}
        for clip_id in atlas["clips"]:
            runtime_id = bindings.get(clip_id, clip_id)
            clip = runtime_states.get(runtime_id, {})
            normalized_states[clip_id] = {
                "loop": clip.get("loop"),
                "frames": clip.get("frames"),
            }
        expected_animation = {
            "atlas": atlas["output"]["path"],
            "grid": {"columns": atlas["layout"]["columns"], "rows": atlas["layout"]["rows"]},
            "directions": atlas["layout"]["directions"],
            "anchor": render["anchor"], "drawSize": render["drawSize"],
            "collisionOffset": render["collisionOffset"], "groundY": render["groundY"], "shadow": render["shadow"],
            "sockets": render["sockets"],
            "states": {clip_id: {"loop": clip["loop"], "frames": clip["frames"]} for clip_id, clip in atlas["clips"].items()},
        }
        actual_animation = {
            "atlas": runtime_atlas.get("src") if isinstance(runtime_atlas, dict) else runtime_atlas,
            "grid": runtime.get("grid"), "directions": runtime.get("directions"),
            "anchor": runtime.get("anchor"), "drawSize": runtime.get("drawSize"),
            "collisionOffset": runtime.get("collisionOffset"), "groundY": runtime.get("groundY"), "shadow": runtime.get("shadow"),
            "sockets": runtime.get("sockets"), "states": normalized_states,
        }
        if actual_animation != expected_animation:
            raise SpriteToolError(f"Theme runtime metadata drift: animations.specialists.{atlas['specialist']}")
    return {"module": manifest["theme"]["module"], "animatedSpecialists": sorted(item[0] for item in discovered)}


def contact_sheet(atlas_image, atlas):
    width, height = atlas_image.size
    sheet = Image.new("RGBA", (width, height), (18, 27, 39, 255))
    draw = ImageDraw.Draw(sheet)
    tile = 16
    for y in range(0, height, tile):
        for x in range(0, width, tile):
            color = (34, 45, 58, 255) if (x // tile + y // tile) % 2 else (20, 30, 43, 255)
            draw.rectangle((x, y, min(width - 1, x + tile - 1), min(height - 1, y + tile - 1)), fill=color)
    sheet.alpha_composite(atlas_image)
    layout = atlas["layout"]
    for column in range(layout["columns"] + 1):
        x = min(width - 1, column * layout["cellWidth"]); draw.line((x, 0, x, height), fill=(99, 242, 223, 210), width=1)
    for row in range(layout["rows"] + 1):
        y = min(height - 1, row * layout["cellHeight"]); draw.line((0, y, width, y), fill=(99, 242, 223, 210), width=1)
    return sheet


def preview_metadata(atlas, output_hash, frames_report):
    return {
        "schema": "lastlight.sprite-preview.v1", "atlas": atlas["id"], "specialist": atlas["specialist"],
        "outputSha256": output_hash, "size": [atlas["output"]["width"], atlas["output"]["height"]],
        "cellSize": [atlas["layout"]["cellWidth"], atlas["layout"]["cellHeight"]],
        "directions": atlas["layout"]["directions"], "states": atlas["layout"]["states"], "clips": atlas["clips"],
        "render": atlas["render"], "frames": frames_report, "edgePolicy": atlas["processing"]["edgePolicy"],
    }


def inspect(root, manifest_path, manifest, compare_output=True):
    theme = verify_theme_coverage(root, manifest, compare_metadata=compare_output)
    reports, built = [], []
    for atlas in manifest["atlases"]:
        image, encoded, frames_report = build_atlas(root, atlas)
        output_hash = sha256_bytes(encoded)
        output_path = resolve(root, atlas["output"]["path"])
        if compare_output:
            if not output_path.is_file(): raise SpriteToolError(f"Missing runtime atlas: {atlas['output']['path']}")
            committed = output_path.read_bytes()
            if sha256_bytes(committed) != atlas["output"]["sha256"]: raise SpriteToolError(f"Runtime output SHA-256 mismatch: {atlas['output']['path']}")
            if encoded != committed: raise SpriteToolError(f"Runtime output is not byte-identical to deterministic build: {atlas['output']['path']}")
        reports.append({
            "id": atlas["id"], "specialist": atlas["specialist"], "sourceSha256": atlas["source"]["sha256"],
            "outputSha256": output_hash, "bytes": len(encoded), "dimensions": list(image.size), "frameCount": len(frames_report),
            "unusedCellCount": len(atlas["layout"]["unusedCells"]), "frames": frames_report,
        })
        built.append((atlas, image, encoded, frames_report))
    return {"schema": "lastlight.sprite-report.v1", "manifest": manifest_path.name, "toolVersion": manifest["tool"]["version"], "pillowVersion": PILLOW_VERSION, "theme": theme, "atlases": reports}, built


def write_build(output_dir, report, built):
    output_dir.mkdir(parents=True, exist_ok=True)
    for atlas, image, encoded, frames_report in built:
        atlas_dir = output_dir / atlas["id"]; atlas_dir.mkdir(parents=True, exist_ok=True)
        (atlas_dir / Path(atlas["output"]["path"]).name).write_bytes(encoded)
        contact = contact_sheet(image, atlas)
        (atlas_dir / "contact-sheet.png").write_bytes(save_png_bytes(contact, atlas["processing"]["png"]))
        (atlas_dir / "preview.json").write_bytes(canonical_json(preview_metadata(atlas, sha256_bytes(encoded), frames_report), pretty=True))
    (output_dir / "report.json").write_bytes(canonical_json(report, pretty=True))


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("mode", choices=["verify", "build", "report"])
    parser.add_argument("--manifest", default="tooling/sprite-manifest.json")
    parser.add_argument("--output-dir", default="artifacts/sprite-tooling")
    parser.add_argument("--output", default="")
    parser.add_argument("--runtime", action="store_true", help="Write deterministic atlases to runtime output paths")
    args = parser.parse_args(argv)
    lastlight_root = Path(__file__).resolve().parent.parent
    manifest_path = resolve(lastlight_root, args.manifest)
    manifest = load_manifest(manifest_path)
    report, built = inspect(lastlight_root, manifest_path, manifest, compare_output=args.mode != "build")
    if args.mode == "build":
        output_dir = resolve(lastlight_root, args.output_dir)
        write_build(output_dir, report, built)
        if args.runtime:
            for atlas, _image, encoded, _frames in built:
                target = resolve(lastlight_root, atlas["output"]["path"]); target.parent.mkdir(parents=True, exist_ok=True); target.write_bytes(encoded)
    elif args.mode == "report" and args.output:
        output = resolve(lastlight_root, args.output); output.parent.mkdir(parents=True, exist_ok=True); output.write_bytes(canonical_json(report, pretty=True))
    print(canonical_json(report, pretty=True).decode("utf-8"), end="")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except SpriteToolError as error:
        print(f"sprite-tool: error: {error}", file=sys.stderr)
        raise SystemExit(1)
