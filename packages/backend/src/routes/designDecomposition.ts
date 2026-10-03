import { Router, Response } from 'express';
import path from 'path';
import prisma from '../lib/prisma';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { decryptSecret as decryptKey } from '../lib/crypto';
import { analyzeDesign, fetchVisionRegions, reconstructDesign, reconstructElementRegion } from '../services/designDecomposition/DesignDecomposer';
import { ProviderKeys, TextRegionInput } from '../services/designDecomposition/types';

const router = Router();

// Same BYOK-then-env-fallback resolution ai.ts uses. Keys stay on the server:
// the browser only ever calls these routes, never a provider.
async function resolveKey(userId: string | undefined, provider: 'openai' | 'anthropic'): Promise<string | undefined> {
  const setting = await prisma.aISetting.findFirst({ where: { userId, provider, isActive: true } });
  if (setting) return decryptKey(setting.encryptedKey);
  return (provider === 'openai' ? process.env.OPENAI_API_KEY : process.env.ANTHROPIC_API_KEY) || undefined;
}

async function resolveKeys(userId: string | undefined): Promise<ProviderKeys> {
  const [openai, anthropic] = await Promise.all([resolveKey(userId, 'openai'), resolveKey(userId, 'anthropic')]);
  return { openai, anthropic };
}

function resolveUploadPath(url: unknown): string {
  if (typeof url !== 'string' || !url.startsWith('/uploads/') || url.includes('..')) throw new Error('url must be a /uploads/... path');
  return path.join(process.cwd(), url.replace(/^\//, ''));
}

function parseRegions(input: unknown): TextRegionInput[] {
  if (!Array.isArray(input)) throw new Error('textRegions must be an array');
  if (input.length > 300) throw new Error('Too many text regions');
  return input.map((r: any) => {
    const nums = [r?.x, r?.y, r?.width, r?.height];
    if (typeof r?.id !== 'string' || !nums.every((n) => typeof n === 'number' && Number.isFinite(n)) || r.width <= 0 || r.height <= 0) {
      throw new Error('Malformed text region');
    }
    const c = r.core;
    const core = c && [c.x, c.y, c.width, c.height].every((n: any) => typeof n === 'number' && Number.isFinite(n))
      ? { x: c.x, y: c.y, width: c.width, height: c.height } : undefined;
    return { id: r.id, x: r.x, y: r.y, width: r.width, height: r.height, core };
  });
}

// Vision detection alone — no text involved, so the frontend can call this the
// moment the image finishes uploading, running concurrently with client-side
// OCR instead of waiting for it. /analyze below accepts this route's result
// back as `precomputedVision` so the same image is never analyzed twice.
router.post('/analyze-vision', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const absolutePath = resolveUploadPath(req.body?.url);
    const result = await fetchVisionRegions(absolutePath, await resolveKeys(req.userId));
    res.json(result);
  } catch (error: any) {
    console.error('[design/analyze-vision] failed', error);
    // 400 for bad input (invalid URL, missing field), 500 for internal failures
    const isInputError = error?.message?.startsWith('url must be') || error?.message?.startsWith('textRegions');
    res.status(isInputError ? 400 : 500).json({ error: error?.message || 'Failed to analyze design' });
  }
});

// Stage 1 — understand the image. Read-only: validates OCR text regions into
// real glyph masks, asks a vision provider for graphic regions, and segments
// the reliable ones. Reports (never fakes) what isn't available.
router.post('/analyze', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const absolutePath = resolveUploadPath(req.body?.url);
    const pv = req.body?.precomputedVision;
    const precomputedVision = pv && Array.isArray(pv.regions) && pv.status
      ? { regions: pv.regions, status: pv.status, cached: !!pv.cached }
      : undefined;
    const result = await analyzeDesign({
      absolutePath,
      textRegions: parseRegions(req.body?.textRegions),
      keys: await resolveKeys(req.userId),
      precomputedVision,
    });
    res.json(result);
  } catch (error: any) {
    console.error('[design/analyze] failed', error);
    const isInputError = error?.message?.startsWith('url must be') || error?.message?.startsWith('textRegions') || error?.message?.startsWith('Too many') || error?.message?.startsWith('Malformed');
    res.status(isInputError ? 400 : 500).json({ error: error?.message || 'Failed to analyze design' });
  }
});

// Stage 2 — remove exactly the pixels that are becoming editable layers and
// reconstruct the background beneath them. Always starts from the original
// file; the source image is never modified.
router.post('/reconstruct', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const url = req.body?.url as string;
    const absolutePath = resolveUploadPath(url);
    const acceptedTextIds = Array.isArray(req.body?.acceptedTextIds) ? req.body.acceptedTextIds.filter((s: any) => typeof s === 'string') : [];
    const objectIds = Array.isArray(req.body?.objectIds) ? req.body.objectIds.filter((s: any) => typeof s === 'string') : [];
    const result = await reconstructDesign({
      absolutePath, url,
      allTextRegions: parseRegions(req.body?.textRegions),
      acceptedTextIds, objectIds,
      keys: await resolveKeys(req.userId),
    });
    res.json(result);
  } catch (error: any) {
    console.error('[design/reconstruct] failed', error);
    const isInputError = error?.message?.startsWith('url must be') || error?.message?.startsWith('textRegions') || error?.message?.startsWith('Too many') || error?.message?.startsWith('Malformed');
    res.status(isInputError ? 400 : 500).json({ error: error?.message || 'Failed to reconstruct background' });
  }
});

// On-demand, single-element reconstruction — the progressive replacement for
// calling /reconstruct over everything at import time. Called the moment a
// specific element is actually edited/moved/deleted in the editor, never
// before. Idempotent per elementId (see reconstructElementRegion).
router.post('/reconstruct-region', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const absolutePath = resolveUploadPath(req.body?.url);
    const elementId = req.body?.elementId;
    const kind = req.body?.kind;
    if (typeof elementId !== 'string' || !elementId) throw Object.assign(new Error('elementId is required'), { isInput: true });
    if (kind !== 'text' && kind !== 'object') throw Object.assign(new Error("kind must be 'text' or 'object'"), { isInput: true });
    const result = await reconstructElementRegion({
      absolutePath,
      allTextRegions: parseRegions(req.body?.textRegions),
      elementId, kind,
      keys: await resolveKeys(req.userId),
    });
    res.json(result);
  } catch (error: any) {
    console.error('[design/reconstruct-region] failed', error);
    const isInputError = error?.isInput || error?.message?.startsWith('url must be') || error?.message?.startsWith('textRegions') || error?.message?.startsWith('Too many') || error?.message?.startsWith('Malformed');
    res.status(isInputError ? 400 : 500).json({ error: error?.message || 'Failed to reconstruct region' });
  }
});

export default router;
