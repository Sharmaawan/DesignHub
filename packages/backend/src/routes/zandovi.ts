import { Router, Response } from 'express';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import path from 'path';
import fs from 'fs';

const router = Router();

const ZANDOVI_BASE = process.env.ZANDOVI_API_BASE_URL || 'https://app.zandovi.com/api/v1';

// Thin server-side proxy for Zandovi's template-rendering API — the API key
// (X-Api-Key) stays here and is never sent to the frontend. Every route just
// forwards to the matching Zandovi endpoint and passes the JSON through,
// except /generate, which downloads the rendered image and hands back a
// local URL instead of the raw bytes (matches how every other image-
// producing route in this app — uploads, background removal, exports —
// already hands the frontend a URL, not a blob).
async function zandoviFetch(pathSuffix: string, init?: RequestInit) {
  const apiKey = process.env.ZANDOVI_API_KEY;
  if (!apiKey) {
    const err: any = new Error('Zandovi is not configured on this server (missing ZANDOVI_API_KEY)');
    err.status = 503;
    throw err;
  }
  const res = await fetch(`${ZANDOVI_BASE}${pathSuffix}`, {
    ...init,
    headers: { 'X-Api-Key': apiKey, 'Content-Type': 'application/json', ...(init?.headers || {}) },
  });
  return res;
}

// Lets the frontend show/hide the Zandovi section without leaking whether
// (or which) key is set.
router.get('/status', authMiddleware, (_req: AuthRequest, res: Response) => {
  res.json({ configured: !!process.env.ZANDOVI_API_KEY });
});

router.get('/projects', authMiddleware, async (_req: AuthRequest, res: Response) => {
  try {
    const zRes = await zandoviFetch('/projects');
    const data = await zRes.json();
    if (!zRes.ok) return res.status(zRes.status).json(data);
    res.json(data);
  } catch (err: any) {
    console.error('[zandovi/projects] failed', err);
    res.status(err.status || 502).json({ error: err.message || 'Failed to reach Zandovi' });
  }
});

router.get('/projects/:projectId/templates', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const zRes = await zandoviFetch(`/projects/${encodeURIComponent(req.params.projectId)}/templates`);
    const data = await zRes.json();
    if (!zRes.ok) return res.status(zRes.status).json(data);
    res.json(data);
  } catch (err: any) {
    console.error('[zandovi/templates] failed', err);
    res.status(err.status || 502).json({ error: err.message || 'Failed to reach Zandovi' });
  }
});

router.get('/templates/:templateId', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const zRes = await zandoviFetch(`/templates/${encodeURIComponent(req.params.templateId)}`);
    const data = await zRes.json();
    if (!zRes.ok) return res.status(zRes.status).json(data);
    res.json(data);
  } catch (err: any) {
    console.error('[zandovi/template] failed', err);
    res.status(err.status || 502).json({ error: err.message || 'Failed to reach Zandovi' });
  }
});

// A one-time-per-template preview render, using the template's own default
// values (no variables sent) — Zandovi's list/detail endpoints don't return
// a thumbnail at all, so this is what puts an actual picture of the design
// on its card instead of just a name and description. Cached to a
// template-id-keyed filename and reused on every later request: without
// that, showing N template cards would spend N renders against the
// account's render quota on every single panel open.
router.get('/templates/:templateId/preview', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const dir = path.join(process.cwd(), 'uploads', 'zandovi');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const filename = `preview-${req.params.templateId}.png`;
    const filePath = path.join(dir, filename);
    if (!fs.existsSync(filePath)) {
      // variables is a required field even when you want every variable to
      // fall back to its own default — Zandovi rejects a request that omits
      // it entirely ("Variables map is required"), and scale must be >= 1
      // ("Scale must be at least 1") — both confirmed directly against the
      // real API, which returned a 400 on the first attempt at this without
      // them.
      const zRes = await zandoviFetch(`/templates/${encodeURIComponent(req.params.templateId)}/generate`, {
        method: 'POST',
        body: JSON.stringify({ format: 'png', options: { scale: 1 }, delivery: 'binary', variables: {} }),
      });
      if (!zRes.ok) {
        const errData = await zRes.json().catch(() => ({ error: `Zandovi returned ${zRes.status}` }));
        return res.status(zRes.status).json(errData);
      }
      const buffer = Buffer.from(await zRes.arrayBuffer());
      fs.writeFileSync(filePath, buffer);
    }
    res.json({ url: `/uploads/zandovi/${filename}` });
  } catch (err: any) {
    console.error('[zandovi/preview] failed', err);
    res.status(err.status || 502).json({ error: err.message || 'Failed to reach Zandovi' });
  }
});

// Renders the template with the given variables and saves the result under
// uploads/zandovi — same on-disk convention as backgroundRemoval.ts — then
// returns its URL so the frontend can drop it straight onto a canvas as an
// image element the same way an uploaded file already works.
router.post('/templates/:templateId/generate', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const { variables } = req.body || {};
    const zRes = await zandoviFetch(`/templates/${encodeURIComponent(req.params.templateId)}/generate`, {
      method: 'POST',
      body: JSON.stringify({
        format: 'png',
        options: { scale: 1 },
        delivery: 'binary',
        ...(variables ? { variables } : {}),
      }),
    });
    if (!zRes.ok) {
      const errData = await zRes.json().catch(() => ({ error: `Zandovi returned ${zRes.status}` }));
      return res.status(zRes.status).json(errData);
    }
    const buffer = Buffer.from(await zRes.arrayBuffer());
    const dir = path.join(process.cwd(), 'uploads', 'zandovi');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const filename = `zandovi-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.png`;
    fs.writeFileSync(path.join(dir, filename), buffer);
    res.json({ url: `/uploads/zandovi/${filename}` });
  } catch (err: any) {
    console.error('[zandovi/generate] failed', err);
    res.status(err.status || 502).json({ error: err.message || 'Failed to reach Zandovi' });
  }
});

export default router;
