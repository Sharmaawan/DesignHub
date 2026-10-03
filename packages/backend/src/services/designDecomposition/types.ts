// Bump whenever the pipeline's output for the same input could change (new
// mask thresholds, different inpainting, new gates) — it's part of every cache
// key, so old cached results are never mistaken for current ones.
export const DECOMPOSITION_VERSION = '1.0.0';

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface TextRegionInput extends Rect {
  id: string;
  /** The raw OCR glyph box (before any padding). Ink outside it is not text (a rule, an underline, a neighboring graphic) and is left alone. */
  core?: Rect;
}

export interface TextRegionResult {
  id: string;
  /** False = leave this region flattened in the background (its pixels are NOT erased). */
  accepted: boolean;
  reason?: string;
  /** Tight box around the actual glyph pixels, in original-image pixels. */
  ink?: Rect;
  inkColor?: string;
  inkBackground?: string;
  /** PNG data URL (white = glyph pixel), cropped to `ink`, so the client can fit fonts against the real shape. */
  maskPng?: string;
}

export type ObjectType = 'logo' | 'photo' | 'badge' | 'icon' | 'decorative' | 'shape' | 'panel' | 'qr';

export interface DetectedRegion extends Rect {
  id: string;
  type: ObjectType;
  description: string;
  confidence: number;
  /** Dominant fill for solid-color shape/panel candidates. */
  color?: string;
}

export interface ObjectResult extends DetectedRegion {
  /** True only if a real mask was produced AND passed every quality gate. */
  extracted: boolean;
  /** Present when extracted: transparent-background PNG of just the object, placed at `bbox`-equivalent `cutoutRect`. */
  cutoutUrl?: string;
  cutoutRect?: Rect;
  /** Why this region stays flattened (or how it was handled). */
  reason?: string;
}

export interface CapabilityStatus {
  available: boolean;
  provider?: string;
  reason?: string;
}

export interface AnalyzeResult {
  sourceHash: string;
  version: string;
  imageWidth: number;
  imageHeight: number;
  texts: TextRegionResult[];
  objects: ObjectResult[];
  capabilities: {
    vision: CapabilityStatus;
    segmentation: CapabilityStatus;
    aiInpaint: CapabilityStatus;
  };
  cached: { vision: boolean };
}

export interface ReconstructResult {
  sourceHash: string;
  version: string;
  backgroundUrl: string;
  method: 'none' | 'local-inpaint' | 'ai-inpaint+local-inpaint';
  cached: boolean;
  warnings: string[];
  /** Objects whose extraction had to be abandoned during reconstruction (e.g. AI inpaint failed) — client must not create elements for them. */
  droppedObjectIds: string[];
}

export interface ProviderKeys {
  openai?: string;
  anthropic?: string;
}
