# training the squirrel/bird/empty model

the app at `../index.html` works immediately on a stock model (knows "fox
squirrel"). this pipeline trains a custom model on your own feeder footage and
drops it into `../model/`, where the app auto-loads it — no code change.

## one-time setup (isolated venv, nothing touches system python)

```sh
cd training
python3 -m venv .venv && source .venv/bin/activate
pip install imageio-ffmpeg tensorflow tensorflowjs
# tensorflowjs drags in tensorflow-decision-forests, whose protobuf gencode
# clashes with tf 2.19 on py3.9. we don't use it, so drop it:
pip uninstall -y tensorflow-decision-forests ydf
# and make tfjs's (now-absent) import of it optional:
#   in .venv/.../tensorflowjs/converters/tf_saved_model_conversion_v2.py
#   wrap `import tensorflow_decision_forests` in try/except.
```

`imageio-ffmpeg` ships its own ffmpeg binary, so no homebrew needed. (this venv
is already set up and patched — the above is just for reproducing it.)

## pipeline

1. **extract frames** from the video (~1 fps is plenty):
   ```sh
   python3 extract_frames.py /path/to/feeder.mov --fps 1
   ```
   → `frames/000001.jpg …`

2. **label** — sort frames into `dataset/squirrel/`, `dataset/bird/`,
   `dataset/empty/`. (claude does this pass by reviewing the frames; rough
   timestamps of squirrel appearances make it fast and accurate.)

3. **train + export**:
   ```sh
   python3 train.py --data dataset --out ../model
   ```
   → `../model/model.json`, `group1-shard*.bin`, `labels.json`

4. reload the app — it picks up the custom model automatically.

## notes
- inputs are scaled to [-1, 1] to match the browser preprocessing in index.html.
- keep classes roughly balanced; the `empty` class (idle feeder, plus birds /
  wind / shadows with no squirrel) is what suppresses false alarms.
- best accuracy comes from training frames shot from the **same angle the phone
  will actually sit at**.
