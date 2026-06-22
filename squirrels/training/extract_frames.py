#!/usr/bin/env python3
"""extract sampled frames from the feeder video.

uses the ffmpeg binary bundled by the imageio-ffmpeg pip package, so no
homebrew / system ffmpeg needed.

  python3 extract_frames.py /path/to/feeder.mov --fps 1 --width 480

frames land in ./frames/ as 000001.jpg, 000002.jpg, ...  at --fps 1 a 30-min
clip yields ~1800 frames, which is plenty to label down into squirrel/bird/empty.
"""
import argparse, os, subprocess, sys


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("video")
    ap.add_argument("--fps", type=float, default=1.0, help="frames per second to sample")
    ap.add_argument("--width", type=int, default=480, help="output width (keeps aspect)")
    ap.add_argument("--out", default=os.path.join(os.path.dirname(__file__), "frames"))
    a = ap.parse_args()

    try:
        import imageio_ffmpeg
    except ImportError:
        sys.exit("missing dep — run:  pip install imageio-ffmpeg")

    ffmpeg = imageio_ffmpeg.get_ffmpeg_exe()
    os.makedirs(a.out, exist_ok=True)
    cmd = [
        ffmpeg, "-y", "-i", a.video,
        "-vf", f"fps={a.fps},scale={a.width}:-1",
        "-q:v", "3",
        os.path.join(a.out, "%06d.jpg"),
    ]
    print("running:", " ".join(cmd))
    subprocess.run(cmd, check=True)
    n = len([f for f in os.listdir(a.out) if f.endswith(".jpg")])
    print(f"done — {n} frames in {a.out}")


if __name__ == "__main__":
    main()
