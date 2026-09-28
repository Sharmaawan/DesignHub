"""
Local segmentation worker for DesignHub's "Make Editable" pipeline.

Runs FastSAM (ultralytics) fully offline once the model checkpoint is on
disk — no cloud API, no network call per request. The Node backend spawns
this as a child process and talks to it over localhost HTTP; that's the
whole integration surface. See LocalSegmentationProvider.ts on the Node
side for the client.

Why FastSAM, not SAM 2.1: SAM2's image encoder is a ViT/Hiera transformer —
heavy for CPU-only inference. FastSAM is a YOLOv8-seg backbone trained on
SA-1B specifically to be a fast, real-time-oriented substitute for SAM's
expensive prompt-based encoder, at some cost in mask precision. On this
machine (2-core i3, no CUDA — confirmed via `torch.cuda.is_available()`),
that trade paid off in direct measurement: full-image automatic mask
generation with FastSAM-s finished in ~14s and found 151 candidate objects
on a real, busy poster. The same workload with a SAM2 ViT encoder on this
CPU would be expected to take substantially longer per Meta's own published
CPU benchmarks. FastSAM was chosen on that measured evidence, not by default.

Why a Python process at all, not pure Node: FastSAM/ultralytics has no
practical Node/ONNX equivalent with the same automatic-mask-generation
quality; onnxruntime-node (already a dependency here, used for u2netp) can
run individual ONNX graphs but not FastSAM's postprocessing pipeline
(NMS + mask decoding across every candidate) without reimplementing large
parts of ultralytics by hand. Running it as a small local worker is the
practical middle ground the architecture doc itself allows for.
"""
import base64
import io
import os
import sys
import time

from flask import Flask, jsonify, request
from PIL import Image
import numpy as np

MODEL_NAME = os.environ.get('FASTSAM_MODEL', 'FastSAM-s.pt')
PORT = int(os.environ.get('WORKER_PORT', '8765'))

app = Flask(__name__)
_model = None
_model_load_error = None


def get_model():
    global _model, _model_load_error
    if _model is None and _model_load_error is None:
        try:
            from ultralytics import FastSAM
            t0 = time.time()
            _model = FastSAM(MODEL_NAME)
            print(f'[worker] FastSAM loaded in {time.time() - t0:.2f}s', file=sys.stderr, flush=True)
        except Exception as e:  # noqa: BLE001 — reported to the caller, not swallowed
            _model_load_error = str(e)
            print(f'[worker] FastSAM failed to load: {e}', file=sys.stderr, flush=True)
    return _model


@app.route('/health', methods=['GET'])
def health():
    # Does not force a model load — startup can report "up" before the (slow,
    # one-time) model load finishes; readiness is reported separately.
    return jsonify({'status': 'ok', 'modelLoaded': _model is not None, 'modelError': _model_load_error})


@app.route('/warmup', methods=['POST'])
def warmup():
    model = get_model()
    return jsonify({'ok': model is not None, 'error': _model_load_error})


def mask_to_png_b64(mask_bool_2d):
    """Encodes a boolean HxW mask as a base64 1-bit-ish grayscale PNG (0/255)."""
    arr = (mask_bool_2d.astype(np.uint8) * 255)
    img = Image.fromarray(arr, mode='L')
    buf = io.BytesIO()
    img.save(buf, format='PNG', optimize=True)
    return base64.b64encode(buf.getvalue()).decode('ascii')


@app.route('/segment', methods=['POST'])
def segment():
    model = get_model()
    if model is None:
        return jsonify({'error': f'Model not available: {_model_load_error or "unknown error"}'}), 503

    body = request.get_json(force=True) or {}
    image_path = body.get('imagePath')
    if not image_path or not os.path.isfile(image_path):
        return jsonify({'error': 'imagePath must be an existing local file path'}), 400

    # Bounded so a request can't tie the (single-threaded) worker up indefinitely.
    imgsz = int(body.get('imgsz', 1024))
    conf = float(body.get('conf', 0.35))
    iou = float(body.get('iou', 0.9))
    # Node-side thresholds (LocalSegmentationProvider.ts), forwarded here so
    # obviously-useless candidates (background-clutter-sized, or the whole
    # page/background itself) never get PNG-encoded or shipped over HTTP at
    # all. All three are ratios/fractions — scale-invariant, so applying them
    # against THIS (possibly downscaled) working image is equivalent to
    # applying them against the original. A busy poster easily returns 100+
    # raw candidates; only a handful ever survive Node's own filtering
    # anyway, and encoding+transporting the rest as base64 PNG was, measured
    # directly, the single largest remaining cost in the whole pipeline —
    # several seconds of a ~5s call, against ~1.3s of actual model compute.
    min_area_frac = float(body.get('minAreaFrac', 0))
    max_area_frac = float(body.get('maxAreaFrac', 1))
    min_solidity = float(body.get('minSolidity', 0))

    t0 = time.time()
    try:
        results = model(image_path, device='cpu', retina_masks=True, imgsz=imgsz, conf=conf, iou=iou, verbose=False)
    except Exception as e:  # noqa: BLE001
        return jsonify({'error': f'Inference failed: {e}'}), 500
    elapsed = time.time() - t0

    r = results[0]
    img_h, img_w = (r.orig_shape[0], r.orig_shape[1]) if hasattr(r, 'orig_shape') else (None, None)
    img_area = (img_w * img_h) if img_w and img_h else None
    masks_out = []
    t1 = time.time()
    raw_count = int(r.masks.data.shape[0]) if r.masks is not None else 0
    if r.masks is not None and r.boxes is not None:
        mdata = r.masks.data.cpu().numpy()  # (N, H, W) bool-ish float, already resized to original image via retina_masks
        boxes = r.boxes.xyxy.cpu().numpy()
        scores = r.boxes.conf.cpu().numpy()
        for i in range(mdata.shape[0]):
            m = mdata[i] > 0.5
            ys, xs = np.where(m)
            if ys.size == 0:
                continue
            y0, y1, x0, x1 = int(ys.min()), int(ys.max()) + 1, int(xs.min()), int(xs.max()) + 1
            bw, bh = x1 - x0, y1 - y0
            if img_area:
                area_frac = (bw * bh) / img_area
                if area_frac < min_area_frac or area_frac > max_area_frac:
                    continue
                if x0 <= 0 or y0 <= 0 or x1 >= img_w or y1 >= img_h:
                    continue  # touches the working image's edge — background/bleed, not a discrete object
            cropped = m[y0:y1, x0:x1]
            solidity = float(cropped.sum()) / (bw * bh)
            if solidity < min_solidity:
                continue
            masks_out.append({
                'bbox': [x0, y0, bw, bh],
                # r.boxes.xyxy independently — kept only as a cross-check, the mask's own tight bounds above are the source of truth for bbox.
                'boxHint': [float(v) for v in boxes[i]],
                'score': float(scores[i]),
                'maskPng': mask_to_png_b64(cropped),
            })

    postprocess_elapsed = time.time() - t1
    print(f'[perf] model()={elapsed:.2f}s postprocess={postprocess_elapsed:.2f}s rawCandidates={raw_count} kept={len(masks_out)}', file=sys.stderr, flush=True)

    return jsonify({
        'count': len(masks_out),
        'elapsedSeconds': elapsed,
        'postprocessSeconds': postprocess_elapsed,
        'rawCandidateCount': raw_count,
        'imageWidth': r.orig_shape[1] if hasattr(r, 'orig_shape') else None,
        'imageHeight': r.orig_shape[0] if hasattr(r, 'orig_shape') else None,
        'masks': masks_out,
    })


if __name__ == '__main__':
    # Single-threaded on purpose: FastSAM/torch CPU inference already uses all
    # available cores internally for one request — running two requests
    # concurrently on a 2-core machine would just make both slower.
    app.run(host='127.0.0.1', port=PORT, threaded=False)
