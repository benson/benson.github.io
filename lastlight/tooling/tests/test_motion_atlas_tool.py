import hashlib
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


def atlas_record(root, rows, touching=False):
    source = make_source(rows, touching)
    source_path = root / "assets" / "source.png"
    source_path.parent.mkdir(parents=True)
    source.save(source_path, format="PNG")
    source_hash = hashlib.sha256(source_path.read_bytes()).hexdigest()
    states = [f"pose-{index}" for index in range(rows)]
    return {
        "id": f"fixture-{rows}",
        "kind": "specialist",
        "rows": rows,
        "source": {"path": "assets/source.png", "sha256": source_hash, "width": 1024, "height": 1536},
        "output": {"path": "assets/output.webp", "pixelSha256": "0" * 64, "width": 1024, "height": rows * 256},
        "directions": list(tool.DIRECTIONS),
        "states": states,
        "anchor": [.5, .875],
    }


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
