#!/usr/bin/env python3
"""Normalize authored motion sheets into isolated 256px runtime atlas cells."""

from __future__ import annotations

import argparse
import hashlib
import io
import json
import math
import subprocess
import sys
from pathlib import Path

from PIL import Image, ImageDraw, __version__ as PILLOW_VERSION


SCHEMA = "lastlight.motion-normalization.v1"
DIRECTIONS = ["south", "west", "north", "east"]
SAFE_PATH_PREFIXES = ("assets/", "artifacts/")


class MotionAtlasError(Exception):
    pass


def fail(condition, message):
    if not condition:
        raise MotionAtlasError(message)


def exact(value, keys, label):
    fail(isinstance(value, dict), f"{label} must be an object")
    unknown = sorted(set(value) - set(keys))
    fail(not unknown, f"{label} contains unknown fields: {', '.join(unknown)}")
    missing = [key for key in keys if key not in value]
    fail(not missing, f"{label} is missing fields: {', '.join(missing)}")
    return value


def safe_path(value, label, suffixes):
    fail(isinstance(value, str) and value.startswith(SAFE_PATH_PREFIXES), f"{label} must be under assets/ or artifacts/")
    fail(".." not in value and "\\" not in value and value == value.lower(), f"{label} must be a lowercase relative path")
    fail(Path(value).suffix in suffixes, f"{label} must end in {' or '.join(suffixes)}")


def sha256_bytes(value):
    return hashlib.sha256(value).hexdigest()


def sha256_file(path):
    return sha256_bytes(path.read_bytes())


def pixel_sha256(image):
    rgba = image.convert("RGBA")
    header = f"RGBA:{rgba.width}x{rgba.height}:".encode("ascii")
    return sha256_bytes(header + rgba.tobytes())


def canonical_json(value):
    return (json.dumps(value, sort_keys=True, indent=2, ensure_ascii=True) + "\n").encode("utf-8")


def resolve(root, relative):
    path = (root / relative).resolve()
    fail(root.resolve() in path.parents, f"Path escapes Lastlight root: {relative}")
    return path


def validate_manifest(manifest):
    exact(manifest, ["schema", "tool", "normalization", "atlases"], "manifest")
    fail(manifest["schema"] == SCHEMA, f"manifest.schema must be {SCHEMA}")
    tool = exact(manifest["tool"], ["name", "version", "pillowVersion"], "manifest.tool")
    fail(tool["name"] == "lastlight-motion-atlas-tool", "manifest.tool.name is invalid")
    fail(tool["pillowVersion"] == PILLOW_VERSION, f"Pillow {tool['pillowVersion']} is required; found {PILLOW_VERSION}")
    normalization = exact(
        manifest["normalization"],
        ["columns", "cellSize", "bleed", "minComponentPixels", "maxRuntimeBytes", "webp"],
        "manifest.normalization",
    )
    fail(normalization["columns"] == 4, "normalization.columns must be 4")
    fail(normalization["cellSize"] == 256, "normalization.cellSize must be 256")
    fail(isinstance(normalization["bleed"], int) and 8 <= normalization["bleed"] <= 32, "normalization.bleed must be 8..32")
    fail(isinstance(normalization["minComponentPixels"], int) and 1 <= normalization["minComponentPixels"] <= 256, "normalization.minComponentPixels must be 1..256")
    fail(isinstance(normalization["maxRuntimeBytes"], int) and normalization["maxRuntimeBytes"] > 0, "normalization.maxRuntimeBytes must be positive")
    webp = exact(normalization["webp"], ["lossless", "quality", "method", "exact"], "manifest.normalization.webp")
    fail(webp["lossless"] is False and webp["exact"] is True, "Runtime WebP must use lossy RGB with exact alpha")
    fail(isinstance(webp["quality"], int) and 80 <= webp["quality"] <= 100, "WebP quality must be 80..100")
    fail(isinstance(webp["method"], int) and 0 <= webp["method"] <= 6, "WebP method must be 0..6")

    atlases = manifest["atlases"]
    fail(isinstance(atlases, list) and atlases, "manifest.atlases must be a nonempty list")
    ids, sources, outputs, runtime_keys = set(), set(), set(), set()
    for index, atlas in enumerate(atlases):
        label = f"manifest.atlases[{index}]"
        required_atlas_fields = ["id", "kind", "source", "output", "rows", "directions", "states", "sourceSlots", "sourceRows", "flipX", "anchor"]
        fail(isinstance(atlas, dict), f"{label} must be an object")
        unknown = sorted(set(atlas) - set(required_atlas_fields) - {"sourceGridRows"})
        fail(not unknown, f"{label} contains unknown fields: {', '.join(unknown)}")
        missing = [key for key in required_atlas_fields if key not in atlas]
        fail(not missing, f"{label} is missing fields: {', '.join(missing)}")
        fail(isinstance(atlas["id"], str) and atlas["id"].replace("-", "").isalnum() and atlas["id"] == atlas["id"].lower(), f"{label}.id is invalid")
        fail(atlas["kind"] in ["specialist", "enemy", "boss"], f"{label}.kind is invalid")
        fail(isinstance(atlas["rows"], int) and atlas["rows"] in [5, 6], f"{label}.rows must be 5 or 6")
        source_grid_rows = atlas.get("sourceGridRows", atlas["rows"])
        fail(isinstance(source_grid_rows, int) and source_grid_rows in [5, 6], f"{label}.sourceGridRows must be 5 or 6")
        fail(atlas["directions"] == DIRECTIONS, f"{label}.directions must be {DIRECTIONS}")
        states = atlas["states"]
        fail(isinstance(states, list) and len(states) == atlas["rows"] and len(set(states)) == len(states), f"{label}.states must uniquely name every row")
        fail(all(isinstance(state, str) and state and state == state.lower() for state in states), f"{label}.states are invalid")
        source_slots = atlas["sourceSlots"]
        fail(isinstance(source_slots, list) and len(source_slots) == atlas["rows"], f"{label}.sourceSlots must map every physical row")
        for row, slots in enumerate(source_slots):
            fail(isinstance(slots, list) and sorted(slots) == [0, 1, 2, 3], f"{label}.sourceSlots[{row}] must be a permutation of source slots 0..3")
        frame_ids = {f"{state}.{direction}" for state in states for direction in DIRECTIONS}
        source_rows = atlas["sourceRows"]
        fail(isinstance(source_rows, dict) and set(source_rows).issubset(frame_ids), f"{label}.sourceRows contains an unknown frame id")
        fail(all(isinstance(row, int) and 0 <= row < source_grid_rows for row in source_rows.values()), f"{label}.sourceRows values must name a physical source row")
        flip_x = atlas["flipX"]
        fail(isinstance(flip_x, list) and len(flip_x) == len(set(flip_x)) and set(flip_x).issubset(frame_ids), f"{label}.flipX must contain unique known frame ids")
        anchor = atlas["anchor"]
        fail(isinstance(anchor, list) and len(anchor) == 2 and all(isinstance(v, (int, float)) and 0 < v < 1 for v in anchor), f"{label}.anchor is invalid")

        source = exact(atlas["source"], ["path", "sha256", "width", "height"], f"{label}.source")
        output = exact(atlas["output"], ["path", "pixelSha256", "width", "height"], f"{label}.output")
        safe_path(source["path"], f"{label}.source.path", [".webp", ".png"])
        safe_path(output["path"], f"{label}.output.path", [".webp"])
        fail(isinstance(source["sha256"], str) and len(source["sha256"]) == 64, f"{label}.source.sha256 is invalid")
        fail(isinstance(output["pixelSha256"], str) and len(output["pixelSha256"]) == 64, f"{label}.output.pixelSha256 is invalid")
        fail(all(isinstance(source.get(key), int) and source[key] > 0 for key in ["width", "height"]), f"{label}.source dimensions must be positive integers")
        fail(output["width"] == 1024 and output["height"] == atlas["rows"] * 256, f"{label}.output dimensions do not match the grid")
        runtime_key = (atlas["kind"], atlas["id"])
        fail(atlas["id"] not in ids and source["path"] not in sources and output["path"] not in outputs and runtime_key not in runtime_keys, f"{label} duplicates an id, path, or runtime key")
        ids.add(atlas["id"]); sources.add(source["path"]); outputs.add(output["path"]); runtime_keys.add(runtime_key)


def load_manifest(path):
    try:
        manifest = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        raise MotionAtlasError(f"Cannot read manifest: {error}") from error
    validate_manifest(manifest)
    return manifest


def _find(parents, value):
    while parents[value] != value:
        parents[value] = parents[parents[value]]
        value = parents[value]
    return value


def _union(parents, left, right):
    left, right = _find(parents, left), _find(parents, right)
    if left != right:
        parents[right] = left


def connected_components(alpha, minimum_pixels):
    """Return deterministic 8-connected alpha components as scanline runs."""
    width, height = alpha.size
    pixels = alpha.load()
    parents, run_records, previous = [], [], []
    for y in range(height):
        current = []
        x = 0
        while x < width:
            while x < width and pixels[x, y] == 0:
                x += 1
            if x >= width:
                break
            x0 = x
            while x < width and pixels[x, y] != 0:
                x += 1
            x1 = x
            index = len(parents)
            parents.append(index)
            run_records.append((y, x0, x1, index))
            current.append((x0, x1, index))
        previous_index = 0
        for x0, x1, index in current:
            while previous_index < len(previous) and previous[previous_index][1] < x0 - 1:
                previous_index += 1
            candidate = previous_index
            while candidate < len(previous) and previous[candidate][0] <= x1:
                _union(parents, index, previous[candidate][2])
                candidate += 1
        previous = current

    grouped = {}
    for y, x0, x1, index in run_records:
        root = _find(parents, index)
        component = grouped.setdefault(root, {"runs": [], "area": 0, "sumX": 0, "sumY": 0, "bbox": [x0, y, x1, y + 1], "overlaps": {}})
        length = x1 - x0
        component["runs"].append((y, x0, x1))
        component["area"] += length
        component["sumX"] += length * (x0 + x1 - 1) / 2
        component["sumY"] += length * y
        bbox = component["bbox"]
        bbox[0] = min(bbox[0], x0); bbox[1] = min(bbox[1], y); bbox[2] = max(bbox[2], x1); bbox[3] = max(bbox[3], y + 1)
    components = [component for component in grouped.values() if component["area"] >= minimum_pixels]
    components.sort(key=lambda component: (component["bbox"][1], component["bbox"][0], -component["area"]))
    return components, len(grouped) - len(components)


def add_nominal_overlaps(components, width, height, columns, rows):
    for component in components:
        overlaps = component["overlaps"]
        for y, x0, x1 in component["runs"]:
            row = min(rows - 1, y * rows // height)
            cursor = x0
            while cursor < x1:
                column = min(columns - 1, cursor * columns // width)
                boundary = (column + 1) * width // columns
                end = min(x1, boundary)
                overlaps[(column, row)] = overlaps.get((column, row), 0) + end - cursor
                cursor = end


def choose_primary_components(components, columns, rows, atlas_id):
    """Find the body component for each pose by visual row and direction.

    Generated sheets do not reliably honor their nominal row cuts: some rows are
    shifted by almost a full cell. The primary bodies are nevertheless the
    largest `columns * rows` disconnected regions and retain top-to-bottom and
    left-to-right order. Ranking first, then spatially ordering, recovers that
    authored order without cutting an overflowing body at a nominal boundary.
    """
    required = columns * rows
    fail(len(components) >= required, f"{atlas_id}: expected {required} disconnected poses, found {len(components)}; adjacent poses are touching")
    ranked = sorted(range(len(components)), key=lambda index: (-components[index]["area"], components[index]["bbox"][1], components[index]["bbox"][0]))
    primary_indexes = ranked[:required]
    primary_indexes.sort(key=lambda index: (components[index]["sumY"] / components[index]["area"], components[index]["sumX"] / components[index]["area"]))
    cell_primary = {}
    previous_bottom = None
    for row in range(rows):
        row_indexes = primary_indexes[row * columns:(row + 1) * columns]
        row_indexes.sort(key=lambda index: components[index]["sumX"] / components[index]["area"])
        centers_y = [components[index]["sumY"] / components[index]["area"] for index in row_indexes]
        fail(max(centers_y) - min(centers_y) < 180, f"{atlas_id}: cannot resolve visual pose row {row}; foreground ordering is ambiguous")
        if previous_bottom is not None:
            fail(sum(centers_y) / len(centers_y) > previous_bottom + 24, f"{atlas_id}: visual pose rows {row - 1} and {row} overlap ambiguously")
        previous_bottom = sum(centers_y) / len(centers_y)
        centers_x = [components[index]["sumX"] / components[index]["area"] for index in row_indexes]
        fail(all(centers_x[index + 1] - centers_x[index] > 64 for index in range(columns - 1)), f"{atlas_id}: cannot resolve S/W/N/E order in row {row}")
        for column, component_index in enumerate(row_indexes):
            cell_primary[(column, row)] = component_index
    return cell_primary


def bbox_gap(left, right, cell_width, cell_height):
    dx = max(left[0] - right[2], right[0] - left[2], 0) / cell_width
    dy = max(left[1] - right[3], right[1] - left[3], 0) / cell_height
    return dx * dx + dy * dy


def assign_components(components, primaries, source_size, rows):
    width, height = source_size
    primary_components = {index: cell for cell, index in primaries.items()}
    assignments = {cell: [index] for cell, index in primaries.items()}
    for index, component in enumerate(components):
        if index in primary_components:
            continue
        cx = component["sumX"] / component["area"]
        cy = component["sumY"] / component["area"]
        scores = []
        for cell, primary_index in primaries.items():
            column, row = cell
            main = components[primary_index]
            grid_dx = (cx - (column + .5) * width / 4) / (width / 4)
            grid_dy = (cy - (row + .5) * height / rows) / (height / rows)
            score = bbox_gap(component["bbox"], main["bbox"], width / 4, height / rows) + .04 * (grid_dx * grid_dx + grid_dy * grid_dy)
            scores.append((score, row, column, cell))
        assignments[min(scores)[3]].append(index)
    for indexes in assignments.values():
        indexes.sort()
    return assignments


def extract_pose(source, components, component_indexes):
    bbox = [source.width, source.height, 0, 0]
    for index in component_indexes:
        current = components[index]["bbox"]
        bbox[0] = min(bbox[0], current[0]); bbox[1] = min(bbox[1], current[1]); bbox[2] = max(bbox[2], current[2]); bbox[3] = max(bbox[3], current[3])
    mask = Image.new("L", (bbox[2] - bbox[0], bbox[3] - bbox[1]), 0)
    draw = ImageDraw.Draw(mask)
    for index in component_indexes:
        for y, x0, x1 in components[index]["runs"]:
            draw.line((x0 - bbox[0], y - bbox[1], x1 - bbox[0] - 1, y - bbox[1]), fill=255)
    crop = source.crop(tuple(bbox))
    isolated = Image.new("RGBA", crop.size, (0, 0, 0, 0))
    isolated.paste(crop, (0, 0), mask)
    return isolated, bbox


def fit_pose(pose, cell_size, bleed, anchor):
    anchor_x = round(anchor[0] * cell_size)
    ground_y = min(cell_size - bleed, round(anchor[1] * cell_size))
    available_width = cell_size - bleed * 2
    available_height = ground_y - bleed
    scale = min(available_width / pose.width, available_height / pose.height)
    width = max(1, min(available_width, math.floor(pose.width * scale)))
    height = max(1, min(available_height, math.floor(pose.height * scale)))
    resized = pose.resize((width, height), Image.Resampling.LANCZOS)
    x = max(bleed, min(cell_size - bleed - width, round(anchor_x - width / 2)))
    y = ground_y - height
    cell = Image.new("RGBA", (cell_size, cell_size), (0, 0, 0, 0))
    cell.alpha_composite(resized, (x, y))
    return cell


def validate_output(image, atlas, normalization):
    cell_size, bleed = normalization["cellSize"], normalization["bleed"]
    fail(image.mode == "RGBA" and image.size == (atlas["output"]["width"], atlas["output"]["height"]), f"{atlas['id']}: output dimensions/mode are invalid")
    frames = []
    hashes = {}
    for row, state in enumerate(atlas["states"]):
        for column, direction in enumerate(atlas["directions"]):
            cell = image.crop((column * cell_size, row * cell_size, (column + 1) * cell_size, (row + 1) * cell_size))
            bounds = cell.getchannel("A").getbbox()
            fail(bounds is not None, f"{atlas['id']}: {state}.{direction} is empty")
            gutters = [bounds[0], bounds[1], cell_size - bounds[2], cell_size - bounds[3]]
            fail(min(gutters) >= bleed, f"{atlas['id']}: {state}.{direction} violates the {bleed}px transparent bleed: {gutters}")
            digest = pixel_sha256(cell)
            frame_id = f"{state}.{direction}"
            if digest in hashes:
                prior = hashes[digest]
                fail(frame_id in atlas["sourceRows"] or prior in atlas["sourceRows"], f"{atlas['id']}: duplicate normalized pose at {frame_id}")
            hashes[digest] = frame_id
            frames.append({"id": frame_id, "cell": [column, row], "alphaBounds": list(bounds), "pixelSha256": digest})
    return frames


def build_atlas(root, atlas, normalization):
    source_path = resolve(root, atlas["source"]["path"])
    fail(source_path.is_file(), f"Missing source: {atlas['source']['path']}")
    fail(sha256_file(source_path) == atlas["source"]["sha256"], f"Source SHA-256 mismatch: {atlas['source']['path']}")
    with Image.open(source_path) as opened:
        fail(opened.size == (atlas["source"]["width"], atlas["source"]["height"]), f"Source dimensions mismatch: {atlas['source']['path']}")
        source = opened.convert("RGBA")
    components, ignored_count = connected_components(source.getchannel("A"), normalization["minComponentPixels"])
    source_grid_rows = atlas.get("sourceGridRows", atlas["rows"])
    add_nominal_overlaps(components, source.width, source.height, normalization["columns"], source_grid_rows)
    primaries = choose_primary_components(components, normalization["columns"], source_grid_rows, atlas["id"])
    assignments = assign_components(components, primaries, source.size, source_grid_rows)
    cell_size = normalization["cellSize"]
    output = Image.new("RGBA", (normalization["columns"] * cell_size, atlas["rows"] * cell_size), (0, 0, 0, 0))
    source_frames = []
    for row, state in enumerate(atlas["states"]):
        for column, direction in enumerate(atlas["directions"]):
            frame_id = f"{state}.{direction}"
            source_column = atlas["sourceSlots"][row][column]
            source_row = atlas["sourceRows"].get(frame_id, row)
            cell_key = (source_column, source_row)
            pose, source_bbox = extract_pose(source, components, assignments[cell_key])
            if frame_id in atlas["flipX"]:
                pose = pose.transpose(Image.Transpose.FLIP_LEFT_RIGHT)
            normalized = fit_pose(pose, cell_size, normalization["bleed"], atlas["anchor"])
            output.alpha_composite(normalized, (column * cell_size, row * cell_size))
            source_frames.append({"id": frame_id, "sourceRow": source_row, "sourceSlot": source_column, "flipX": frame_id in atlas["flipX"], "sourceBounds": source_bbox, "componentCount": len(assignments[cell_key])})
    frames = validate_output(output, atlas, normalization)
    for frame, source_frame in zip(frames, source_frames):
        frame.update(source_frame)
    return output, frames, {"components": len(components), "ignoredComponents": ignored_count, "sourceGridRows": source_grid_rows}


def encode_runtime_webp(image, config):
    output = io.BytesIO()
    image.save(
        output,
        format="WEBP",
        lossless=config["lossless"],
        quality=config["quality"],
        method=config["method"],
        exact=config["exact"],
    )
    encoded = output.getvalue()
    with Image.open(io.BytesIO(encoded)) as opened:
        decoded = opened.convert("RGBA")
    return encoded, decoded


def verify_theme(root, manifest):
    node_script = 'import { LASTLIGHT_THEME as t } from "./themes/lastlight.js"; process.stdout.write(JSON.stringify(t.animations));'
    try:
        completed = subprocess.run(["node", "--input-type=module", "--eval", node_script], cwd=root, check=True, capture_output=True, text=True)
        animations = json.loads(completed.stdout)
    except (OSError, subprocess.CalledProcessError, json.JSONDecodeError) as error:
        raise MotionAtlasError(f"Cannot inspect runtime theme animations: {error}") from error
    groups = {"specialist": "specialists", "enemy": "enemies", "boss": "bosses"}
    for atlas in manifest["atlases"]:
        runtime = animations.get(groups[atlas["kind"]], {}).get(atlas["id"])
        fail(isinstance(runtime, dict), f"Runtime motion missing: {atlas['kind']}.{atlas['id']}")
        expected_size = [atlas["output"]["width"], atlas["output"]["height"]]
        fail(runtime.get("atlas", {}).get("src") == atlas["output"]["path"], f"Runtime atlas path drift: {atlas['kind']}.{atlas['id']}")
        fail(runtime.get("atlas", {}).get("expectedSize") == expected_size, f"Runtime atlas size drift: {atlas['kind']}.{atlas['id']}")
        fail(runtime.get("grid") == {"columns": 4, "rows": atlas["rows"]}, f"Runtime grid drift: {atlas['kind']}.{atlas['id']}")
        fail(runtime.get("directions") == DIRECTIONS, f"Runtime direction drift: {atlas['kind']}.{atlas['id']}")


def inspect(root, manifest, compare_outputs, check_theme=True):
    if check_theme:
        verify_theme(root, manifest)
    reports, built, runtime_bytes = [], [], 0
    for atlas in manifest["atlases"]:
        image, source_frames, segmentation = build_atlas(root, atlas, manifest["normalization"])
        encoded, runtime_image = encode_runtime_webp(image, manifest["normalization"]["webp"])
        frames = validate_output(runtime_image, atlas, manifest["normalization"])
        for frame, source_frame in zip(frames, source_frames):
            frame.update({key: source_frame[key] for key in ["sourceRow", "sourceSlot", "flipX", "sourceBounds", "componentCount"]})
        digest = pixel_sha256(runtime_image)
        runtime_bytes += len(encoded)
        if compare_outputs:
            output_path = resolve(root, atlas["output"]["path"])
            fail(output_path.is_file(), f"Missing runtime output: {atlas['output']['path']}")
            with Image.open(output_path) as opened:
                committed = opened.convert("RGBA")
            validate_output(committed, atlas, manifest["normalization"])
            fail(pixel_sha256(committed) == atlas["output"]["pixelSha256"], f"Runtime output pixel SHA-256 mismatch: {atlas['output']['path']}")
            fail(committed.tobytes() == runtime_image.tobytes(), f"Runtime output decoded pixels are not the deterministic rebuild: {atlas['output']['path']}")
        report = {"id": atlas["id"], "kind": atlas["kind"], "sourceSha256": atlas["source"]["sha256"], "outputPixelSha256": digest, "runtimeBytes": len(encoded), "dimensions": list(runtime_image.size), **segmentation, "frames": frames}
        reports.append(report); built.append((atlas, runtime_image, encoded, frames))
    fail(runtime_bytes <= manifest["normalization"]["maxRuntimeBytes"], f"Normalized runtime atlases use {runtime_bytes} bytes; budget is {manifest['normalization']['maxRuntimeBytes']}")
    return {"schema": "lastlight.motion-normalization-report.v1", "toolVersion": manifest["tool"]["version"], "pillowVersion": PILLOW_VERSION, "runtimeBytes": runtime_bytes, "runtimeBudgetBytes": manifest["normalization"]["maxRuntimeBytes"], "atlases": reports}, built


def write_qa(root, output_dir, report, built, manifest):
    output_dir.mkdir(parents=True, exist_ok=True)
    for atlas, _image, encoded, _frames in built:
        directory = output_dir / atlas["kind"] / atlas["id"]
        directory.mkdir(parents=True, exist_ok=True)
        (directory / "atlas.webp").write_bytes(encoded)
    (output_dir / "report.json").write_bytes(canonical_json(report))


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("mode", choices=["verify", "build", "report"])
    parser.add_argument("--manifest", default="tooling/motion-atlas-manifest.json")
    parser.add_argument("--output-dir", default="artifacts/motion-atlas-tooling")
    parser.add_argument("--output", default="")
    parser.add_argument("--runtime", action="store_true", help="Write normalized WebPs to runtime output paths")
    parser.add_argument("--skip-theme", action="store_true", help=argparse.SUPPRESS)
    root = Path(__file__).resolve().parent.parent
    args = parser.parse_args(argv)
    manifest_path = resolve(root, args.manifest)
    manifest = load_manifest(manifest_path)
    report, built = inspect(root, manifest, compare_outputs=args.mode != "build", check_theme=not args.skip_theme)
    if args.mode == "build":
        write_qa(root, resolve(root, args.output_dir), report, built, manifest)
        if args.runtime:
            for atlas, _image, encoded, _frames in built:
                target = resolve(root, atlas["output"]["path"])
                target.parent.mkdir(parents=True, exist_ok=True)
                target.write_bytes(encoded)
    elif args.mode == "report" and args.output:
        target = resolve(root, args.output); target.parent.mkdir(parents=True, exist_ok=True); target.write_bytes(canonical_json(report))
    print(canonical_json(report).decode("utf-8"), end="")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except MotionAtlasError as error:
        print(f"motion-atlas-tool: error: {error}", file=sys.stderr)
        raise SystemExit(1)
