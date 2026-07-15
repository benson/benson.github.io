import hashlib
import json
import tempfile
import unittest
from pathlib import Path

from PIL import Image, ImageDraw

import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import motion_atlas_tool as tool


NORMALIZATION = {
    "columns": 4,
    "cellSize": 256,
    "bleed": 8,
    "minComponentPixels": 8,
    "maxRuntimeBytes": 10_000_000,
    "webp": {"lossless": False, "quality": 92, "method": 4, "exact": True},
}


def source_centers(rows):
    return [round(230 + index * (1200 / max(1, rows - 1))) for index in range(rows)]


def make_source(rows, touching=False):
    image = Image.new("RGBA", (1024, 1536), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)
    centers_y = source_centers(rows)
    for row, center_y in enumerate(centers_y):
        for column in range(4):
            center_x = 112 + column * 256
            color = (30 + row * 25, 40 + column * 40, 210 - row * 20, 255)
            draw.ellipse((center_x - 62, center_y - 105, center_x + 62, center_y + 105), fill=color)
    if touching:
        center_x = 112
        draw.rectangle((center_x - 4, centers_y[0] + 100, center_x + 4, centers_y[1] - 100), fill=(255, 255, 255, 255))
    return image


def atlas_record(root, rows, touching=False, source_rows=None):
    source_rows = source_rows or rows
    source = make_source(source_rows, touching)
    source_path = root / "assets" / "source.png"
    source_path.parent.mkdir(parents=True)
    source.save(source_path, format="PNG")
    source_hash = hashlib.sha256(source_path.read_bytes()).hexdigest()
    states = [f"pose-{index}" for index in range(rows)]
    record = {
        "id": f"fixture-{rows}",
        "kind": "specialist",
        "rows": rows,
        "source": {"path": "assets/source.png", "sha256": source_hash, "width": 1024, "height": 1536},
        "output": {"path": "assets/output.webp", "pixelSha256": "0" * 64, "width": 1024, "height": rows * 256},
        "directions": list(tool.DIRECTIONS),
        "states": states,
        "sourceSlots": [[0, 1, 2, 3] for _row in range(rows)],
        "sourceRows": {},
        "flipX": [],
        "anchor": [.5, .875],
    }
    if source_rows != rows:
        record["sourceGridRows"] = source_rows
    return record


class MotionAtlasNormalizationTests(unittest.TestCase):
    def assert_isolated(self, output, rows):
        self.assertEqual(output.size, (1024, rows * 256))
        authored_colors = {
            (30 + authored_row * 25, 40 + authored_column * 40, 210 - authored_row * 20)
            for authored_row in range(rows)
            for authored_column in range(4)
        }
        for row in range(rows):
            for column in range(4):
                cell = output.crop((column * 256, row * 256, (column + 1) * 256, (row + 1) * 256))
                bounds = cell.getchannel("A").getbbox()
                self.assertIsNotNone(bounds)
                self.assertGreaterEqual(min(bounds[0], bounds[1], 256 - bounds[2], 256 - bounds[3]), 8)
                expected = (30 + row * 25, 40 + column * 40, 210 - row * 20)
                opaque_colors = {pixel[:3] for pixel in cell.get_flattened_data() if pixel[3] == 255}
                self.assertIn(expected, opaque_colors)
                self.assertEqual(opaque_colors & authored_colors, {expected}, f"neighbor color leaked into row {row}, column {column}")

    def test_crossing_4x6_poses_are_recovered_without_neighbor_fragments(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            atlas = atlas_record(root, 6)
            output, frames, _segmentation = tool.build_atlas(root, atlas, NORMALIZATION)
            self.assertEqual(len(frames), 24)
            self.assert_isolated(output, 6)

    def test_crossing_4x5_poses_normalize_to_1024x1280(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            atlas = atlas_record(root, 5)
            output, frames, _segmentation = tool.build_atlas(root, atlas, NORMALIZATION)
            self.assertEqual(len(frames), 20)
            self.assert_isolated(output, 5)

    def test_touching_neighbor_poses_fail_instead_of_guessing(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            atlas = atlas_record(root, 6, touching=True)
            with self.assertRaisesRegex(tool.MotionAtlasError, "touching"):
                tool.build_atlas(root, atlas, NORMALIZATION)

    def test_source_slot_overrides_reorder_semantics_without_moving_rows(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            atlas = atlas_record(root, 5)
            atlas["sourceSlots"][2] = [0, 3, 2, 1]
            output, frames, _segmentation = tool.build_atlas(root, atlas, NORMALIZATION)
            west = output.crop((256, 2 * 256, 512, 3 * 256))
            east = output.crop((3 * 256, 2 * 256, 4 * 256, 3 * 256))
            source_west = (30 + 2 * 25, 40 + 1 * 40, 210 - 2 * 20)
            source_east = (30 + 2 * 25, 40 + 3 * 40, 210 - 2 * 20)
            self.assertIn(source_east, {pixel[:3] for pixel in west.get_flattened_data() if pixel[3] == 255})
            self.assertIn(source_west, {pixel[:3] for pixel in east.get_flattened_data() if pixel[3] == 255})
            self.assertEqual(frames[2 * 4 + 1]["sourceSlot"], 3)
            self.assertEqual(frames[2 * 4 + 3]["sourceSlot"], 1)

    def test_source_row_reuse_and_mirroring_are_explicit_and_deterministic(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            atlas = atlas_record(root, 5)
            atlas["sourceRows"]["pose-1.north"] = 3
            atlas["flipX"].append("pose-1.west")
            output, frames, _segmentation = tool.build_atlas(root, atlas, NORMALIZATION)
            north = output.crop((2 * 256, 1 * 256, 3 * 256, 2 * 256))
            reused_color = (30 + 3 * 25, 40 + 2 * 40, 210 - 3 * 20)
            self.assertIn(reused_color, {pixel[:3] for pixel in north.get_flattened_data() if pixel[3] == 255})
            self.assertEqual(frames[1 * 4 + 2]["sourceRow"], 3)
            self.assertEqual(frames[1 * 4 + 1]["flipX"], True)

    def test_five_row_legacy_source_promotes_to_six_row_runtime_grid(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            atlas = atlas_record(root, 6, source_rows=5)
            for column, direction in enumerate(tool.DIRECTIONS):
                atlas["sourceRows"][f"pose-1.{direction}"] = 0
                atlas["sourceRows"][f"pose-2.{direction}"] = 1
                atlas["sourceRows"][f"pose-3.{direction}"] = 2
                atlas["sourceRows"][f"pose-4.{direction}"] = 3
                atlas["sourceRows"][f"pose-5.{direction}"] = 4
            output, frames, segmentation = tool.build_atlas(root, atlas, NORMALIZATION)
            self.assertEqual(output.size, (1024, 1536))
            self.assertEqual(len(frames), 24)
            self.assertEqual(segmentation["sourceGridRows"], 5)
            first_idle = output.crop((0, 0, 256, 256))
            second_idle = output.crop((0, 256, 256, 512))
            self.assertEqual(tool.pixel_sha256(first_idle), tool.pixel_sha256(second_idle))
            self.assertEqual(frames[-1]["sourceRow"], 4)

    def test_manifest_rejects_incomplete_or_duplicate_source_slot_maps(self):
        manifest_path = Path(__file__).resolve().parents[1] / "motion-atlas-manifest.json"
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
        manifest["atlases"][0]["sourceSlots"][0] = [0, 1, 1, 3]
        with self.assertRaisesRegex(tool.MotionAtlasError, "permutation"):
            tool.validate_manifest(manifest)

    def test_production_direction_overrides_pin_echo_and_vesper_semantics(self):
        manifest_path = Path(__file__).resolve().parents[1] / "motion-atlas-manifest.json"
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
        atlases = {atlas["id"]: atlas for atlas in manifest["atlases"]}
        echo = atlases["echo"]
        self.assertEqual(echo["sourceSlots"][2], [0, 3, 2, 1])
        self.assertEqual(echo["sourceRows"], {"run-a.north": 3})
        self.assertEqual(echo["flipX"], ["run-a.west", "run-b.west", "action.west"])
        vesper = atlases["vesper"]
        self.assertEqual(vesper["sourceSlots"][0], [0, 3, 2, 1])
        self.assertEqual(vesper["sourceSlots"][1], [0, 3, 2, 1])
        self.assertEqual(vesper["sourceSlots"][3], [0, 3, 2, 1])
        self.assertEqual(vesper["flipX"], ["run-a.west", "run-b.west", "action.west", "hurt-down.west"])

    def test_webp_encoding_is_repeatable_and_preserves_alpha_gutters(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            atlas = atlas_record(root, 5)
            output, _frames, _segmentation = tool.build_atlas(root, atlas, NORMALIZATION)
            first_bytes, first = tool.encode_runtime_webp(output, NORMALIZATION["webp"])
            second_bytes, second = tool.encode_runtime_webp(output, NORMALIZATION["webp"])
            self.assertEqual(first_bytes, second_bytes)
            self.assertEqual(tool.pixel_sha256(first), tool.pixel_sha256(second))
            tool.validate_output(first, atlas, NORMALIZATION)


if __name__ == "__main__":
    unittest.main()
