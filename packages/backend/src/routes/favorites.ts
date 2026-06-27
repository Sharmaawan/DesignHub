import { Router, Request, Response } from 'express';
import prisma from '../lib/prisma';
import { authMiddleware, AuthRequest } from '../middleware/auth';

const router = Router();

router.get('/', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const favorites = await prisma.favorite.findMany({
      where: { userId: req.userId },
      include: { project: true, template: true },
      orderBy: { createdAt: 'desc' },
    });
    res.json(favorites);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch favorites' });
  }
});

router.post('/project/:projectId', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const existing = await prisma.favorite.findUnique({
      where: { projectId_userId: { projectId: req.params.projectId, userId: req.userId! } },
    });
    if (existing) {
      await prisma.favorite.delete({ where: { id: existing.id } });
      return res.json({ favorited: false });
    }
    await prisma.favorite.create({
      data: { projectId: req.params.projectId, userId: req.userId! },
    });
    res.json({ favorited: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to toggle favorite' });
  }
});

router.post('/template/:templateId', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const existing = await prisma.favorite.findUnique({
      where: { templateId_userId: { templateId: req.params.templateId, userId: req.userId! } },
    });
    if (existing) {
      await prisma.favorite.delete({ where: { id: existing.id } });
      return res.json({ favorited: false });
    }
    await prisma.favorite.create({
      data: { templateId: req.params.templateId, userId: req.userId! },
    });
    res.json({ favorited: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to toggle favorite' });
  }
});

export default router;
