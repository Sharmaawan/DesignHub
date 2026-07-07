import { Router, Request, Response } from 'express';
import prisma from '../lib/prisma';
import { authMiddleware, AuthRequest } from '../middleware/auth';

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
