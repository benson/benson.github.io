#!/usr/bin/env python3
"""train a 3-class squirrel/bird/empty classifier and export it for tensorflow.js.

expects labeled frames sorted like:

  dataset/
    squirrel/*.jpg
    bird/*.jpg
    empty/*.jpg

transfer-learns a small MobileNetV2 (alpha 0.5) head, then converts to the
web format the app loads from ./model/.  inputs are scaled to [-1, 1] to match
the browser code (fromPixels -> /127.5 -> -1) in index.html.

  python3 train.py --data dataset --out ../model
"""
import argparse, json, os, subprocess, sys

IMG = 224
ALPHA = 1.0


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--data", default=os.path.join(os.path.dirname(__file__), "dataset"))
    ap.add_argument("--out", default=os.path.join(os.path.dirname(__file__), "..", "model"))
    ap.add_argument("--epochs", type=int, default=12)
    ap.add_argument("--batch", type=int, default=32)
    ap.add_argument("--finetune", action="store_true", help="also unfreeze + fine-tune the base")
    a = ap.parse_args()

    try:
        import tensorflow as tf
    except ImportError:
        sys.exit("missing dep — run:  pip install tensorflow tensorflowjs")

    # [-1, 1] preprocessing, applied in the data pipeline (NOT baked into the
    # model) so the browser does the identical scaling at inference time.
    scale = tf.keras.layers.Rescaling(1.0 / 127.5, offset=-1)

    # augmentation lives in the data pipeline (training only), NOT in the model,
    # so the exported inference model is just clean mobilenet + head.
    aug = tf.keras.Sequential([
        tf.keras.layers.RandomFlip("horizontal"),
        tf.keras.layers.RandomBrightness(0.2),
        tf.keras.layers.RandomContrast(0.2),
        tf.keras.layers.RandomZoom(0.1),
    ])

    def prep(ds, training=False):
        # augment on the raw [0,255] images FIRST (RandomBrightness/Contrast
        # assume that range), THEN rescale to [-1,1] for mobilenet.
        if training:
            ds = ds.map(lambda x, y: (aug(x, training=True), y))
        ds = ds.map(lambda x, y: (scale(x), y))
        return ds.prefetch(tf.data.AUTOTUNE)

    common = dict(image_size=(IMG, IMG), batch_size=a.batch, label_mode="categorical",
                  seed=1337, validation_split=0.15)
    train = tf.keras.utils.image_dataset_from_directory(a.data, subset="training", **common)
    val = tf.keras.utils.image_dataset_from_directory(a.data, subset="validation", **common)
    labels = train.class_names  # alphabetical: bird, empty, squirrel
    print("classes:", labels)

    base = tf.keras.applications.MobileNetV2(
        input_shape=(IMG, IMG, 3), alpha=ALPHA, include_top=False, weights="imagenet")
    base.trainable = False

    inp = tf.keras.Input((IMG, IMG, 3))
    x = base(inp, training=False)
    x = tf.keras.layers.GlobalAveragePooling2D()(x)
    x = tf.keras.layers.Dropout(0.2)(x)
    out = tf.keras.layers.Dense(len(labels), activation="softmax")(x)
    model = tf.keras.Model(inp, out)

    # train the head with the base frozen; keep the BEST-val weights so we never
    # export a worse model than we reached.
    es = tf.keras.callbacks.EarlyStopping(
        monitor="val_accuracy", patience=8, restore_best_weights=True)
    model.compile(optimizer="adam", loss="categorical_crossentropy", metrics=["accuracy"])
    model.fit(prep(train, training=True), validation_data=prep(val),
              epochs=a.epochs, callbacks=[es])

    if a.finetune:  # opt-in; on this small/similar dataset it tends to hurt
        base.trainable = True
        model.compile(optimizer=tf.keras.optimizers.Adam(1e-5),
                      loss="categorical_crossentropy", metrics=["accuracy"])
        model.fit(prep(train, training=True), validation_data=prep(val), epochs=6,
                  callbacks=[tf.keras.callbacks.EarlyStopping(
                      monitor="val_accuracy", patience=4, restore_best_weights=True)])

    # report squirrel-specific quality on the validation set (3-way accuracy
    # hides what we care about: squirrel vs not-squirrel).
    import numpy as np
    yt, yp = [], []
    for xb, yb in prep(val):
        pr = model.predict(xb, verbose=0)
        yt += np.argmax(yb.numpy(), 1).tolist()
        yp += np.argmax(pr, 1).tolist()
    cm = np.zeros((len(labels), len(labels)), int)
    for t, p in zip(yt, yp): cm[t][p] += 1
    print("confusion (rows=true, cols=pred):", list(labels))
    for i, row in enumerate(cm): print(f"  {labels[i]:8s} {row.tolist()}")
    si = labels.index("squirrel")
    tp = cm[si][si]; fn = int(cm[si].sum()) - tp; fp = int(cm[:, si].sum()) - tp
    prec = tp / (tp + fp) if tp + fp else 0.0
    rec = tp / (tp + fn) if tp + fn else 0.0
    print(f"SQUIRREL val precision={prec:.2f} recall={rec:.2f}")

    # export to tf.js layers format (loaded with tf.loadLayersModel in the app).
    # go via legacy HDF5, which converts most reliably to tfjs_layers_model.
    out = os.path.abspath(a.out)
    os.makedirs(out, exist_ok=True)
    h5 = os.path.join(os.path.dirname(__file__), "_model.h5")
    model.save(h5)
    converter = os.path.join(os.path.dirname(sys.executable), "tensorflowjs_converter")
    subprocess.run([
        converter, "--input_format=keras",
        "--output_format=tfjs_layers_model", h5, out,
    ], check=True)
    with open(os.path.join(out, "labels.json"), "w") as f:
        json.dump(list(labels), f)
    print(f"done — model + labels.json written to {out}")
    print("the app auto-loads it; no code change needed.")


if __name__ == "__main__":
    main()
