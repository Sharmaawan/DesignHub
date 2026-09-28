import { Router, Request, Response } from 'express';
import path from 'path';
import prisma from '../lib/prisma';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { detectFrameHole } from '../lib/frameHoleDetection';

const router = Router();

router.get('/', async (req: Request, res: Response) => {
  try {
    const { category, search } = req.query;
    const where: any = { deletedAt: null };
    if (category && category !== 'All') where.category = category as string;
    if (search) where.name = { contains: search as string };
    const templates = await prisma.template.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });
    res.json(templates);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch templates' });
  }
});

// Must be registered before '/:id' — otherwise Express matches "trash" as an :id.
router.get('/trash', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const templates = await prisma.template.findMany({
      where: { ownerId: req.userId, deletedAt: { not: null } },
      orderBy: { deletedAt: 'desc' },
    });
    res.json(templates);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch deleted templates' });
  }
});

router.get('/:id', async (req: Request, res: Response) => {
  try {
    const template = await prisma.template.findUnique({ where: { id: req.params.id } });
    if (!template) return res.status(404).json({ error: 'Template not found' });
    res.json(template);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch template' });
  }
});

router.post('/', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const { name, category, subcategory, thumbnail, templateData, data, tags, isPremium } = req.body;
    const template = await prisma.template.create({
      data: {
        name, category, subcategory, thumbnail, templateData, data,
        tags: tags || [], isPremium: isPremium || false, ownerId: req.userId,
      },
    });
    res.json(template);
  } catch (error) {
    res.status(500).json({ error: 'Failed to create template' });
  }
});

// Scans a just-uploaded image for a blank "photo goes here" hole — real
// alpha transparency only (see frameHoleDetection.ts for why a flat black/
// white "marker color" isn't trustworthy enough to act on) — so
// UploadTemplateModal can turn it into a real clickable Frame instead of a
// flat background the user's photo just gets dumped on top of. `url` is the
// relative /uploads/... path POST /api/upload already returned — resolving it
// against cwd (not trusting any path outside uploads/) matches how the other
// uploads-relative routes in this app resolve local files.
router.post('/detect-frame', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const { url } = req.body as { url?: string };
    if (!url || !url.startsWith('/uploads/')) {
      return res.status(400).json({ error: 'url must be a /uploads/... path' });
    }
    const absolutePath = path.join(process.cwd(), url.replace(/^\//, ''));
    const hole = await detectFrameHole(absolutePath);
    // A real transparent hole already lets a Frame underneath show through —
    // the uploaded image itself never needs modifying.
    res.json({ hole, overlayUrl: hole ? url : null });
  } catch (error) {
    console.error('[templates/detect-frame] failed', error);
    res.status(500).json({ error: 'Failed to analyze image' });
  }
});

// Soft delete — moves the template to the uploader's own recycle bin. The shared
// built-in catalog (ownerId null) can never be deleted this way, by anyone.
router.delete('/:id', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const template = await prisma.template.findUnique({ where: { id: req.params.id } });
    if (!template || template.ownerId !== req.userId) return res.status(404).json({ error: 'Template not found' });
    await prisma.template.update({ where: { id: req.params.id }, data: { deletedAt: new Date() } });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete template' });
  }
});

router.post('/:id/restore', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const template = await prisma.template.findUnique({ where: { id: req.params.id } });
    if (!template || template.ownerId !== req.userId) return res.status(404).json({ error: 'Template not found' });
    const restored = await prisma.template.update({ where: { id: req.params.id }, data: { deletedAt: null } });
    res.json(restored);
  } catch (error) {
    res.status(500).json({ error: 'Failed to restore template' });
  }
});

router.delete('/:id/permanent', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const template = await prisma.template.findUnique({ where: { id: req.params.id } });
    if (!template || template.ownerId !== req.userId) return res.status(404).json({ error: 'Template not found' });
    await prisma.template.delete({ where: { id: req.params.id } });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to permanently delete template' });
  }
});

export default router;
