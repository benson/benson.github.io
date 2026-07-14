#!/usr/bin/env python3
"""Deterministic runtime specialist motion evidence and CI verifier."""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import subprocess
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont, __version__ as PILLOW_VERSION


ROOT = Path(__file__).resolve().parents[1]
ARTIFACTS = ROOT / "artifacts" / "motion-audit"
EXPECTATIONS = ROOT / "tooling" / "motion-audit-expectations.json"
TILE_SIZE = (360, 280)
BODY_ORIGIN = (180, 132)
BACKGROUND = (4, 12, 19, 255)
PANEL = (9, 24, 34, 255)
INK = (225, 244, 244, 255)
MUTED = (125, 158, 165, 255)
ACCENT = (91, 236, 218, 255)
WARNING = (255, 208, 79, 255)


def sha256_bytes(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


def canonical_bytes(value: object) -> bytes:
    return (json.dumps(value, sort_keys=True, separators=(",", ":")) + "\n").encode("utf-8")


def runtime_metadata() -> dict:
    result = subprocess.run(
        ["node", "tooling/run_motion_audit_metadata.js"],
        cwd=ROOT,
        check=False,
        capture_output=True,
        text=True,
        encoding="utf-8",
    )
    if result.returncode:
        raise RuntimeError(result.stderr.strip() or "runtime motion metadata failed")
    return json.loads(result.stdout)


def load_assets(report: dict) -> tuple[dict[str, Image.Image], dict[str, dict]]:
    images: dict[str, Image.Image] = {}
    summaries: dict[str, dict] = {}
    expected_sizes: dict[str, list[int]] = {}
    for entry in report["contacts"]:
        path = entry["assetPath"]
        source = entry["renderPlan"]["sourceRect"]
        extent = [round(source[0] + source[2]), round(source[1] + source[3])]
        expected_sizes[path] = [max(expected_sizes.get(path, [0, 0])[0], extent[0]), max(expected_sizes.get(path, [0, 0])[1], extent[1])]
    for asset_path in sorted(expected_sizes):
        full_path = ROOT / asset_path
        if not full_path.is_file():
            raise ValueError(f"missing runtime atlas: {asset_path}")
        with Image.open(full_path) as source:
            source.load()
            image = source.convert("RGBA")
        if list(image.size) != expected_sizes[asset_path]:
            raise ValueError(f"{asset_path} is {list(image.size)}, expected {expected_sizes[asset_path]}")
        alpha = image.getchannel("A")
        if alpha.getextrema()[1] == 0:
            raise ValueError(f"{asset_path} is fully transparent")
        images[asset_path] = image
        summaries[asset_path] = {
            "dimensions": list(image.size),
            "pixelSha256": sha256_bytes(image.tobytes()),
        }
    return images, summaries


def exact_rect(values: list[float], label: str) -> tuple[int, int, int, int]:
    rounded = tuple(round(value) for value in values)
    if any(abs(value - integer) > 0.000001 for value, integer in zip(values, rounded)):
        raise ValueError(f"{label} is not pixel aligned: {values}")
    return rounded


def validate_and_enrich(report: dict, images: dict[str, Image.Image], assets: dict[str, dict]) -> dict:
    errors = []
    for collection in [report["contacts"], *(preview["frames"] for preview in report["previews"])]:
        for entry in collection:
            path = entry["assetPath"]
            entry["assetHash"] = assets[path]["pixelSha256"]
            if entry["fallback"]:
                errors.append(f"unexpected fallback: {entry['specialist']}/{entry['mode']}/{entry['requestId']}")
                continue
            image = images[path]
            x, y, width, height = exact_rect(entry["renderPlan"]["sourceRect"], f"{path} source rect")
            if width <= 0 or height <= 0 or x < 0 or y < 0 or x + width > image.width or y + height > image.height:
                errors.append(f"out-of-bounds source rect in {path}: {[x, y, width, height]}")
                continue
            alpha = image.crop((x, y, x + width, y + height)).getchannel("A")
            minimum, maximum = alpha.getextrema()
            if maximum == 0:
                errors.append(f"transparent occupied cell: {path} c{entry['resolvedColumn']} r{entry['resolvedRow']}")
            if minimum == 255:
                errors.append(f"cell has no transparent background: {path} c{entry['resolvedColumn']} r{entry['resolvedRow']}")
    for path, image in images.items():
        sample = next(entry for entry in report["contacts"] if entry["assetPath"] == path)
        cell_width, cell_height = exact_rect(sample["renderPlan"]["sourceRect"], f"{path} cell")[2:]
        rows = image.height // cell_height
        for column in range(4):
            for row in range(rows):
                alpha = image.crop((column * cell_width, row * cell_height, (column + 1) * cell_width, (row + 1) * cell_height)).getchannel("A")
                minimum, maximum = alpha.getextrema()
                if maximum == 0:
                    errors.append(f"transparent occupied cell: {path} c{column} r{row}")
                if minimum == 255:
                    errors.append(f"cell has no transparent background: {path} c{column} r{row}")
    if errors:
        raise ValueError("\n".join(errors))
    return report


def transform_sprite(entry: dict, atlas: Image.Image) -> Image.Image:
    plan = entry["renderPlan"]
    x, y, width, height = exact_rect(plan["sourceRect"], "source rect")
    dx, dy, draw_width, draw_height = plan["destinationRect"]
    sprite = atlas.crop((x, y, x + width, y + height)).resize(
        (round(draw_width), round(draw_height)), Image.Resampling.LANCZOS
    )
    size = 512
    origin = size // 2
    layer = Image.new("RGBA", (size, size))
    layer.alpha_composite(sprite, (round(origin + dx), round(origin + dy)))
    scale_x, scale_y = plan["scale"]
    if scale_x != 1 or scale_y != 1:
        inverse = (
            1 / scale_x, 0, origin - origin / scale_x,
            0, 1 / scale_y, origin - origin / scale_y,
        )
        layer = layer.transform(layer.size, Image.Transform.AFFINE, inverse, resample=Image.Resampling.BICUBIC)
    if plan["rotation"]:
        layer = layer.rotate(
            -math.degrees(plan["rotation"]),
            center=(origin, origin),
            resample=Image.Resampling.BICUBIC,
        )
    if plan["alpha"] != 1:
        alpha = layer.getchannel("A").point(lambda value: round(value * plan["alpha"]))
        layer.putalpha(alpha)
    translate_x, translate_y = plan["translate"]
    left = round(origin - (BODY_ORIGIN[0] + translate_x))
    top = round(origin - (BODY_ORIGIN[1] + translate_y))
    bounds = layer.getchannel("A").getbbox()
    if bounds:
        output_bounds = (bounds[0] - left, bounds[1] - top, bounds[2] - left, bounds[3] - top)
        if output_bounds[0] < 0 or output_bounds[1] < 0 or output_bounds[2] > TILE_SIZE[0] or output_bounds[3] > 180:
            raise ValueError(f"out-of-bounds drawing for {entry['specialist']}/{entry['requestId']}: {output_bounds}")
    return layer.crop((left, top, left + TILE_SIZE[0], top + TILE_SIZE[1]))


def label_lines(entry: dict) -> list[tuple[str, tuple[int, int, int, int]]]:
    status = entry["authoredStatus"]
    fallback = entry["fallbackReason"] if entry["fallback"] else "none"
    socket = entry["socket"]["muzzle"]
    return [
        (f"{entry['specialist'].upper()} / {entry['requestId']} / {entry['mode']}", ACCENT),
        (f"state {entry['requestedState']} -> {entry['resolvedState']}", INK),
        (f"dir {entry['requestedDirection']} -> {entry['resolvedDirection']}  c{entry['resolvedColumn']} r{entry['resolvedRow']}", INK),
        (f"clip {entry['clipTime']:.3f}s / {entry['clipDuration']:.3f}s  {status}", WARNING if status == "synthetic" else INK),
        (f"asset {entry['assetPath']} #{entry['assetHash'][:12]}", MUTED),
        (f"anchor {entry['anchor']} draw {entry['drawSize']}", MUTED),
        (f"socket muzzle {socket['distance']},{socket['vertical']} fallback {fallback}", MUTED),
    ]


def render_tile(entry: dict, atlas: Image.Image, include_labels: bool = True) -> Image.Image:
    tile = Image.new("RGBA", TILE_SIZE, PANEL)
    draw = ImageDraw.Draw(tile)
    draw.rectangle((0, 0, TILE_SIZE[0] - 1, TILE_SIZE[1] - 1), outline=(42, 76, 86, 255))
    draw.line((BODY_ORIGIN[0] - 28, BODY_ORIGIN[1] + 20, BODY_ORIGIN[0] + 28, BODY_ORIGIN[1] + 20), fill=(54, 85, 91, 255), width=1)
    sprite = transform_sprite(entry, atlas)
    tile.alpha_composite(sprite)
    if include_labels:
        font = ImageFont.load_default(size=11)
        y = 184
        for text, color in label_lines(entry):
            display = text if len(text) <= 61 else text[:58] + "..."
            draw.text((8, y), display, font=font, fill=color)
            y += 13
    return tile


def contact_sheet(entries: list[dict], atlas: Image.Image) -> Image.Image:
    by_key = {(entry["requestId"], entry["requestedDirection"]): entry for entry in entries}
    requests = ["idle", "run", "mobility-dash", "cast-e", "cast-r", "hurt", "down", "revive", "victory"]
    directions = ["south", "west", "north", "east"]
    sheet = Image.new("RGBA", (TILE_SIZE[0] * 4, TILE_SIZE[1] * 9), BACKGROUND)
    for row, request in enumerate(requests):
        for column, direction in enumerate(directions):
            entry = by_key[(request, direction)]
            sheet.alpha_composite(render_tile(entry, atlas), (column * TILE_SIZE[0], row * TILE_SIZE[1]))
    return sheet


def preview_images(preview: dict, atlas: Image.Image) -> list[Image.Image]:
    frames = []
    font = ImageFont.load_default(size=15)
    for entry in preview["frames"]:
        image = Image.new("RGBA", tuple(preview.get("viewport", [960, 360])), BACKGROUND)
        tile = render_tile(entry, atlas, include_labels=False)
        image.alpha_composite(tile, (300, 30))
        draw = ImageDraw.Draw(image)
        draw.text((24, 24), f"{entry['specialist'].upper()} / {preview['mode']}", font=font, fill=ACCENT)
        draw.text((24, 52), f"{entry['timeMs'] / 1000:.1f}s  {entry['scenario']}", font=font, fill=WARNING)
        draw.text((24, 80), f"{entry['requestedState']} -> {entry['resolvedState']}", font=font, fill=INK)
        draw.text((24, 108), f"{entry['resolvedDirection']}  c{entry['resolvedColumn']} r{entry['resolvedRow']}", font=font, fill=INK)
        draw.text((684, 52), f"{entry['authoredStatus']}", font=font, fill=INK)
        draw.text((684, 80), f"clip {entry['clipTime']:.2f}s", font=font, fill=INK)
        draw.text((684, 108), f"fallback {entry['fallback']}", font=font, fill=INK)
        draw.text((684, 136), f"#{entry['assetHash'][:12]}", font=font, fill=MUTED)
        frames.append(image)
    return frames


def decoded_digest(images: list[Image.Image]) -> str:
    digest = hashlib.sha256()
    for image in images:
        digest.update(image.tobytes())
    return digest.hexdigest()


def generate(report: dict, images: dict[str, Image.Image], write_media: bool) -> tuple[dict, list[dict]]:
    contact_hashes = {}
    preview_hashes = {}
    media = []
    for specialist in sorted({entry["specialist"] for entry in report["contacts"]}):
        asset_path = next(entry["assetPath"] for entry in report["contacts"] if entry["specialist"] == specialist)
        atlas = images[asset_path]
        for mode in ["normal", "reduced-motion"]:
            key = f"{specialist}/{mode}"
            entries = [entry for entry in report["contacts"] if entry["specialist"] == specialist and entry["mode"] == mode]
            sheet = contact_sheet(entries, atlas)
            contact_hashes[key] = sha256_bytes(sheet.tobytes())
            preview = next(item for item in report["previews"] if item["specialist"] == specialist and item["mode"] == mode)
            preview["viewport"] = [960, 360]
            frames = preview_images(preview, atlas)
            preview_hashes[key] = decoded_digest(frames)
            if write_media:
                output_dir = ARTIFACTS / specialist / mode
                output_dir.mkdir(parents=True, exist_ok=True)
                sheet_path = output_dir / "contact-sheet.png"
                preview_path = output_dir / "transition-preview.webp"
                sheet.save(sheet_path, format="PNG", optimize=False, compress_level=9)
                frames[0].save(
                    preview_path,
                    format="WEBP",
                    save_all=True,
                    append_images=frames[1:],
                    duration=report["settings"]["frameStepMs"],
                    loop=0,
                    lossless=True,
                    method=6,
                )
                media.extend([
                    {"path": sheet_path.relative_to(ROOT).as_posix(), "bytes": sheet_path.stat().st_size, "kind": "contact-sheet"},
                    {"path": preview_path.relative_to(ROOT).as_posix(), "bytes": preview_path.stat().st_size, "kind": "transition-preview"},
                ])
    return {"contacts": contact_hashes, "previews": preview_hashes}, media


def summary(report: dict, assets: dict[str, dict], pixel_hashes: dict, media: list[dict]) -> dict:
    return {
        "schema": report["schema"],
        "pillowVersion": PILLOW_VERSION,
        "coverage": report["coverage"],
        "metadataSha256": report["metadataSha256"],
        "assets": assets,
        "decodedPixelSha256": pixel_hashes,
        "budgets": {
            "maxContactSheetBytes": 2_000_000,
            "maxTransitionPreviewBytes": 12_000_000,
            "maxAggregateMediaBytes": 180_000_000,
            "contactSheetDimensions": [1440, 2520],
            "previewDimensions": [960, 360],
        },
        "media": media,
    }


def verify_budgets(result: dict) -> None:
    budgets = result["budgets"]
    aggregate = sum(entry["bytes"] for entry in result.get("media", []))
    errors = []
    for entry in result.get("media", []):
        maximum = budgets["maxContactSheetBytes"] if entry["kind"] == "contact-sheet" else budgets["maxTransitionPreviewBytes"]
        if entry["bytes"] > maximum:
            errors.append(f"{entry['path']} is {entry['bytes']} bytes (budget {maximum})")
    if aggregate > budgets["maxAggregateMediaBytes"]:
        errors.append(f"motion-audit media is {aggregate} bytes (budget {budgets['maxAggregateMediaBytes']})")
    if errors:
        raise ValueError("\n".join(errors))


def artifact_index(result: dict) -> str:
    rows = []
    for specialist in sorted({key.split("/")[0] for key in result["decodedPixelSha256"]["contacts"]}):
        cells = []
        for mode in ["normal", "reduced-motion"]:
            base = f"{specialist}/{mode}"
            cells.append(
                f'<td><h3>{mode}</h3><a href="{base}/contact-sheet.png"><img src="{base}/contact-sheet.png" alt="{specialist} {mode} runtime contact sheet"></a>'
                f'<p><a href="{base}/transition-preview.webp">transition preview</a></p></td>'
            )
        rows.append(f"<tr><th>{specialist}</th>{''.join(cells)}</tr>")
    return """<!doctype html><meta charset=\"utf-8\"><title>Lastlight motion audit</title>
<style>body{background:#040c13;color:#dff4f4;font:16px system-ui;margin:24px}table{border-collapse:collapse;width:100%}th,td{border:1px solid #294c56;padding:12px;vertical-align:top}img{width:min(100%,720px);height:auto}a{color:#5becda}</style>
<h1>Lastlight specialist runtime motion audit</h1><p>Fixed viewport, DPR 1, high quality. Generated media is review evidence and is not a runtime dependency.</p>
<table><thead><tr><th>Specialist</th><th>Normal</th><th>Reduced motion</th></tr></thead><tbody>""" + "".join(rows) + "</tbody></table>"


def comparable(result: dict) -> dict:
    return {key: value for key, value in result.items() if key != "media"}


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("command", choices=["report", "verify", "summary"])
    args = parser.parse_args()
    report = runtime_metadata()
    images, assets = load_assets(report)
    report = validate_and_enrich(report, images, assets)
    write_media = args.command == "report"
    pixel_hashes, media = generate(report, images, write_media)
    result = summary(report, assets, pixel_hashes, media)
    verify_budgets(result)
    if write_media:
        ARTIFACTS.mkdir(parents=True, exist_ok=True)
        (ARTIFACTS / "report.json").write_bytes(canonical_bytes({"summary": result, "runtime": report}))
        (ARTIFACTS / "index.html").write_text(artifact_index(result), encoding="utf-8", newline="\n")
    if args.command == "verify":
        if not EXPECTATIONS.is_file():
            raise ValueError(f"missing deterministic expectations: {EXPECTATIONS.relative_to(ROOT)}")
        expected = json.loads(EXPECTATIONS.read_text(encoding="utf-8"))
        actual = comparable(result)
        if actual != expected:
            expected_hash = sha256_bytes(canonical_bytes(expected))
            actual_hash = sha256_bytes(canonical_bytes(actual))
            raise ValueError(f"motion-audit expectations differ (expected {expected_hash}, actual {actual_hash}); inspect with npm run motion-audit:report")
    if args.command in {"summary", "report"}:
        print(json.dumps(comparable(result), sort_keys=True, indent=2))
    if write_media:
        print(f"Wrote {len(media)} media artifacts and index to {ARTIFACTS.relative_to(ROOT)}", file=sys.stderr)
    else:
        print(f"Verified {report['coverage']['contactFrames']} runtime stills and {report['coverage']['previewFrames']} transition frames without writing media", file=sys.stderr)
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (RuntimeError, ValueError, OSError, subprocess.SubprocessError) as error:
        print(f"motion audit failed: {error}", file=sys.stderr)
        raise SystemExit(1)
