import { CapabilityStatus, DetectedRegion, ObjectType, ProviderKeys, Rect } from './types';

// The decomposer never talks to a specific vendor — only to this interface —
// so a different vision model can be dropped in without touching the pipeline.
export interface VisionImage {
  base64: string;
  mime: 'image/png';
  width: number;
  height: number;
}

export interface RawRegion {
  type?: string;
  description?: string;
  x?: number; y?: number; width?: number; height?: number;
  confidence?: number;
}

export interface VisionProvider {
  readonly name: string;
  /** Returns regions in FRACTIONAL coordinates (0-1). Throws VisionUnavailableError when the account/model can't be used. */
  analyzeDesign(image: VisionImage): Promise<RawRegion[]>;
}

export class VisionUnavailableError extends Error {}

const VALID_TYPES = new Set<ObjectType>(['logo', 'photo', 'badge', 'icon', 'decorative', 'shape', 'panel', 'qr']);
export const MIN_REGION_CONFIDENCE = 0.6;
const MIN_AREA_FRACTION = 0.0008;
const MAX_AREA_FRACTION = 0.5;

export const ANALYSIS_PROMPT = [
  'You are analyzing a flattened design image (a poster, certificate, or social media graphic) so specific graphic elements can be made independently editable.',
  '',
  'List every NON-TEXT graphic region: logos, photos, badges/seals, icons, decorative illustrations, colored panels/shapes, QR codes. Do NOT list plain text — text is detected separately.',
  '',
  'Use fractional coordinates (0 to 1, relative to the image width/height — NOT pixels):',
  '{ "type": "logo"|"photo"|"badge"|"icon"|"decorative"|"shape"|"panel"|"qr", "description": "short description", "x": 0-1, "y": 0-1, "width": 0-1, "height": 0-1, "confidence": 0-1 }',
  '',
  'x,y is the top-left corner. Only give a high confidence when you can see the region\'s edges clearly enough for a tight bounding box. If a graphic overlaps or blends into another graphic or the background so its true edges are ambiguous, still report it but use a low confidence that honestly reflects that.',
  '',
  'Respond with ONLY a JSON object: { "regions": [ ... ] }. No other text.',
].join('\n');

/** Pulls the JSON object out of a model reply even if it wrapped it in markdown fences or prose. */
export function parseRegionsJson(text: string): RawRegion[] {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('Vision model returned no JSON object');
  let parsed: any;
  try { parsed = JSON.parse(text.slice(start, end + 1)); } catch { throw new Error('Vision model returned invalid JSON'); }
  return Array.isArray(parsed?.regions) ? parsed.regions : [];
}

function iou(a: Rect, b: Rect): number {
  const l = Math.max(a.x, b.x), t = Math.max(a.y, b.y);
  const r = Math.min(a.x + a.width, b.x + b.width), bt = Math.min(a.y + a.height, b.y + b.height);
  if (r <= l || bt <= t) return 0;
  const inter = (r - l) * (bt - t);
  return inter / (a.width * a.height + b.width * b.height - inter);
}

/**
 * The model's output is never trusted: every region is checked for shape,
 * bounds, size and duplication, then converted from fractions to ORIGINAL
 * image pixels. Anything malformed is dropped, not repaired.
 */
export function validateRegions(raw: RawRegion[], imageWidth: number, imageHeight: number): DetectedRegion[] {
  const out: DetectedRegion[] = [];
  raw.forEach((r, i) => {
    if (!r || !r.type || !VALID_TYPES.has(r.type as ObjectType)) return;
    const nums = [r.x, r.y, r.width, r.height, r.confidence];
    if (!nums.every((v) => typeof v === 'number' && Number.isFinite(v))) return;
    const { x, y, width, height, confidence } = r as Required<RawRegion> & { x: number; y: number; width: number; height: number; confidence: number };
    if (x < 0 || y < 0 || width <= 0 || height <= 0) return;
    if (x + width > 1.02 || y + height > 1.02) return;
    if (confidence < MIN_REGION_CONFIDENCE || confidence > 1) return;
    const px: Rect = {
      x: Math.round(x * imageWidth),
      y: Math.round(y * imageHeight),
      width: Math.round(Math.min(width, 1 - x) * imageWidth),
      height: Math.round(Math.min(height, 1 - y) * imageHeight),
    };
    if (px.width < 2 || px.height < 2) return;
    const area = (px.width * px.height) / (imageWidth * imageHeight);
    if (area < MIN_AREA_FRACTION || area > MAX_AREA_FRACTION) return;
    out.push({ id: `obj-${i}`, type: r.type as ObjectType, description: String(r.description || '').slice(0, 200), ...px, confidence });
  });
  // Drop near-duplicate detections, keeping the more confident one.
  out.sort((a, b) => b.confidence - a.confidence);
  const kept: DetectedRegion[] = [];
  for (const r of out) if (!kept.some((k) => iou(k, r) > 0.6)) kept.push(r);
  return kept;
}

// Credits/model-access/key-validity are account-level facts, not something
// that can change between one image and the next seconds apart — matched
// again below so a provider that just failed for one of these reasons isn't
// re-dialed (and re-timed-out) on every single request while that stays
// true. A generic/unclassified failure isn't matched here on purpose: that
// could be a transient blip worth retrying immediately.
const PERSISTENT_ERROR_PATTERN = /no credits remaining|no access to the required vision model|API key is invalid/;

export function classifyProviderError(provider: string, status: number, message: string): string {
  const m = message || '';
  if (/credit|billing|quota|balance/i.test(m)) return `${provider}: the account has no credits remaining`;
  if (/does not have access to model|model_not_found|not_found_error|does not exist/i.test(m)) return `${provider}: this API key has no access to the required vision model`;
  if (status === 401 || /invalid.*key|incorrect api key/i.test(m)) return `${provider}: the API key is invalid`;
  return `${provider}: request failed (${status}) ${m.slice(0, 120)}`;
}

// Provider name -> when its cooldown (if any) ends + why it was set. In
// memory only, same lifetime rationale as localProposalCache in
// DesignDecomposer.ts — this doesn't need to survive a restart, and a
// restart is itself a reasonable moment to re-check.
const providerCooldownUntil = new Map<string, { until: number; reason: string }>();
const PROVIDER_COOLDOWN_MS = 5 * 60 * 1000;
const SHORT_COOLDOWN_MS = 45 * 1000;

export class OpenAIVisionProvider implements VisionProvider {
  readonly name = 'openai';
  constructor(private apiKey: string, private model = 'gpt-4o') {}
  async analyzeDesign(image: VisionImage): Promise<RawRegion[]> {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this.apiKey}` },
      body: JSON.stringify({
        model: this.model,
        messages: [{ role: 'user', content: [
          { type: 'text', text: ANALYSIS_PROMPT },
          { type: 'image_url', image_url: { url: `data:${image.mime};base64,${image.base64}` } },
        ] }],
        response_format: { type: 'json_object' },
        max_tokens: 2000,
        temperature: 0.2,
      }),
      signal: AbortSignal.timeout(6_000),
    });
    if (!res.ok) {
      const err: any = await res.json().catch(() => ({}));
      throw new VisionUnavailableError(classifyProviderError('OpenAI', res.status, err?.error?.message));
    }
    const data: any = await res.json();
    return parseRegionsJson(data.choices?.[0]?.message?.content || '');
  }
}

export class AnthropicVisionProvider implements VisionProvider {
  readonly name = 'anthropic';
  constructor(private apiKey: string, private model = 'claude-sonnet-4-6') {}
  async analyzeDesign(image: VisionImage): Promise<RawRegion[]> {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': this.apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: this.model,
        max_tokens: 2000,
        messages: [{ role: 'user', content: [
          { type: 'image', source: { type: 'base64', media_type: image.mime, data: image.base64 } },
          { type: 'text', text: ANALYSIS_PROMPT },
        ] }],
      }),
      signal: AbortSignal.timeout(6_000),
    });
    if (!res.ok) {
      const err: any = await res.json().catch(() => ({}));
      throw new VisionUnavailableError(classifyProviderError('Anthropic', res.status, err?.error?.message));
    }
    const data: any = await res.json();
    return parseRegionsJson(data.content?.find((b: any) => b.type === 'text')?.text || '');
  }
}

export function buildVisionProviders(keys: ProviderKeys): VisionProvider[] {
  const list: VisionProvider[] = [];
  if (keys.openai) list.push(new OpenAIVisionProvider(keys.openai));
  if (keys.anthropic) list.push(new AnthropicVisionProvider(keys.anthropic));
  return list;
}

/**
 * Fires every configured provider AT ONCE rather than trying them one after
 * another — with a real per-call timeout (see OpenAIVisionProvider/
 * AnthropicVisionProvider above), a sequential try-then-fallback loop means
 * waiting out one provider's full timeout before even starting the next,
 * doubling worst-case latency for no benefit (only one key is ever actually
 * live at a time in practice). Reports why none worked instead of throwing.
 */
export async function analyzeWithProviders(
  providers: VisionProvider[], image: VisionImage,
): Promise<{ regions: DetectedRegion[]; status: CapabilityStatus }> {
  if (providers.length === 0) {
    return { regions: [], status: { available: false, reason: 'No vision-capable API key is configured (OpenAI or Anthropic)' } };
  }
  const now = Date.now();
  const onCooldown = new Map<string, string>();
  const toCall = providers.filter((p) => {
    const cd = providerCooldownUntil.get(p.name);
    if (cd && cd.until > now) { onCooldown.set(p.name, cd.reason); return false; }
    return true;
  });
  // Every configured provider is on cooldown — skip the network round trip
  // entirely rather than confirming, yet again within the same few minutes,
  // an account-level failure that isn't going to have changed.
  if (toCall.length === 0) {
    return { regions: [], status: { available: false, reason: [...onCooldown.values()].join(' · ') } };
  }
  const settled = await Promise.all(toCall.map((p) =>
    p.analyzeDesign(image).then(
      (raw) => ({ ok: true as const, provider: p, raw }),
      (err) => ({ ok: false as const, provider: p, err }),
    )
  ));
  // First successful result in the callers' own priority order (OpenAI
  // before Anthropic) — not necessarily whichever happened to resolve
  // first, so the provider preference still means something when both work.
  const success = settled.find((s) => s.ok) as { ok: true; provider: VisionProvider; raw: RawRegion[] } | undefined;
  if (success) {
    providerCooldownUntil.delete(success.provider.name); // recovered — stop skipping it
    return { regions: validateRegions(success.raw, image.width, image.height), status: { available: true, provider: success.provider.name } };
  }
  const reasons = settled.map((s) => {
    const err = (s as { ok: false; provider: VisionProvider; err: any }).err;
    const message = err instanceof VisionUnavailableError ? err.message : `${s.provider.name}: ${err?.message || 'failed'}`;
    // Any failure gets at least the short cooldown — a timeout costs just as
    // much wall-clock time as a classified account error, and re-paying it
    // on every request during a flaky network stretch defeats the point.
    // Only a confirmed account-level reason (credits/model-access/key)
    // earns the long one, since that won't resolve itself on its own.
    const cooldownMs = PERSISTENT_ERROR_PATTERN.test(message) ? PROVIDER_COOLDOWN_MS : SHORT_COOLDOWN_MS;
    providerCooldownUntil.set(s.provider.name, { until: now + cooldownMs, reason: message });
    return message;
  });
  return { regions: [], status: { available: false, reason: [...reasons, ...onCooldown.values()].join(' · ') } };
}
