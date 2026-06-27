import { Router, Request, Response } from 'express';
import prisma from '../lib/prisma';
import { authMiddleware, AuthRequest } from '../middleware/auth';

const router = Router();

router.get('/project/:projectId', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const comments = await prisma.comment.findMany({
      where: { projectId: req.params.projectId },
      include: { user: { select: { id: true, name: true, avatar: true } } },
      orderBy: { createdAt: 'desc' },
    });
    res.json(comments);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch comments' });
  }
});

router.post('/', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const { projectId, content, elementId, x, y } = req.body;
    const comment = await prisma.comment.create({
      data: { projectId, userId: req.userId!, content, elementId, x, y },
      include: { user: { select: { id: true, name: true, avatar: true } } },
    });
    res.json(comment);
  } catch (error) {
    res.status(500).json({ error: 'Failed to create comment' });
  }
});

router.put('/:id/resolve', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const comment = await prisma.comment.update({
      where: { id: req.params.id },
      data: { resolved: true },
    });
    res.json(comment);
  } catch (error) {
    res.status(500).json({ error: 'Failed to resolve comment' });
  }
});

router.delete('/:id', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    await prisma.comment.delete({ where: { id: req.params.id } });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete comment' });
  }
});

export default router;
