import * as ort from 'onnxruntime-node';
import sharp from 'sharp';
import fs from 'fs';
import path from 'path';

// u2netp — the same small model family `rembg` uses under the hood, run here
// directly via onnxruntime-node instead of shelling out to Python. Runs fully
// on this server once downloaded; no external call happens per background-removal
// request, only once ever to cache the weights locally.
const MODEL_URL = 'https://github.com/danielgatis/rembg/releases/download/v0.0.0/u2netp.onnx';
const MODEL_DIR = path.join(process.cwd(), 'models');
const MODEL_PATH = path.join(MODEL_DIR, 'u2netp.onnx');
const MODEL_INPUT_SIZE = 320;
// Standard ImageNet normalization — matches what u2net was trained with.
const MEAN = [0.485, 0.456, 0.406];
const STD = [0.229, 0.224, 0.225];

let sessionPromise: Promise<ort.InferenceSession> | null = null;

async function ensureModelDownloaded(): Promise<void> {
  if (fs.existsSync(MODEL_PATH)) return;
  fs.mkdirSync(MODEL_DIR, { recursive: true });
  const res = await fetch(MODEL_URL);
  if (!res.ok || !res.body) {
    throw new Error(`Failed to download background-removal model (HTTP ${res.status})`);
  }
  const tmpPath = `${MODEL_PATH}.downloading`;
  const buffer = Buffer.from(await res.arrayBuffer());
  fs.writeFileSync(tmpPath, buffer);
  fs.renameSync(tmpPath, MODEL_PATH);
}

async function getSession(): Promise<ort.InferenceSession> {
  if (!sessionPromise) {
    sessionPromise = ensureModelDownloaded().then(() => ort.InferenceSession.create(MODEL_PATH));
  }
  return sessionPromise;
}

// Runs background removal on the image at inputPath and returns a PNG buffer with
// the background made transparent. Never trusts a hardcoded input/output tensor
// name — reads them off the loaded session instead, since different ONNX exports
// of the same model can name them differently.
export async function removeBackground(inputPath: string): Promise<Buffer> {
  const session = await getSession();
  const inputName = session.inputNames[0];
  const outputName = session.outputNames[0];

  const original = sharp(inputPath);
  const meta = await original.metadata();
  const width = meta.width || MODEL_INPUT_SIZE;
  const height = meta.height || MODEL_INPUT_SIZE;

  // Resize to the model's fixed input size and normalize into a CHW float32 tensor.
  const { data: rgb } = await original
    .clone()
    .resize(MODEL_INPUT_SIZE, MODEL_INPUT_SIZE, { fit: 'fill' })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const chwData = new Float32Array(3 * MODEL_INPUT_SIZE * MODEL_INPUT_SIZE);
  const pixelCount = MODEL_INPUT_SIZE * MODEL_INPUT_SIZE;
  for (let i = 0; i < pixelCount; i++) {
    for (let c = 0; c < 3; c++) {
      const value = rgb[i * 3 + c] / 255;
      chwData[c * pixelCount + i] = (value - MEAN[c]) / STD[c];
    }
  }

  const inputTensor = new ort.Tensor('float32', chwData, [1, 3, MODEL_INPUT_SIZE, MODEL_INPUT_SIZE]);
  const results = await session.run({ [inputName]: inputTensor });
  const output = results[outputName];

  // Output is a single-channel saliency mask at MODEL_INPUT_SIZE — normalize to
  // 0-255 and resize back up to the original image's real dimensions.
  const maskData = output.data as Float32Array;
  let min = Infinity, max = -Infinity;
  for (const v of maskData) { if (v < min) min = v; if (v > max) max = v; }
  const range = max - min || 1;
  const maskBytes = Buffer.alloc(pixelCount);
  for (let i = 0; i < pixelCount; i++) {
    maskBytes[i] = Math.round(((maskData[i] - min) / range) * 255);
  }

  // .toColourspace('b-w') is required here — without it, sharp silently expands a
  // single-channel raw buffer to 3-channel sRGB during resize, so the "1-channel"
  // mask buffer this produces is actually 3x too long and joinChannel below ends up
  // adding nothing usable (confirmed by inspecting the buffer length directly: it
  // came back as width*height*3, not width*height*1).
  const resizedMask = await sharp(maskBytes, { raw: { width: MODEL_INPUT_SIZE, height: MODEL_INPUT_SIZE, channels: 1 } })
    .resize(width, height, { fit: 'fill' })
    .toColourspace('b-w')
    .raw()
    .toBuffer();

  // Set the alpha channel directly on the raw RGBA buffer, byte by byte, rather
  // than going through sharp's joinChannel/composite — both were tried and neither
  // reliably survives PNG re-encoding (joinChannel's extra band silently gets
  // dropped back to 3 channels; joinChannel+ensureAlpha keeps 4 channels but
  // ensureAlpha overwrites the mask's real values with a flat opaque 255 instead
  // of respecting them). Manually writing into the raw buffer has no such
  // ambiguity — verified against actual pixel stats (varying alpha, not flattened).
  const { data: rgba } = await sharp(inputPath).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const totalPixels = width * height;
  for (let i = 0; i < totalPixels; i++) {
    rgba[i * 4 + 3] = resizedMask[i];
  }
  return sharp(rgba, { raw: { width, height, channels: 4 } }).png().toBuffer();
}
