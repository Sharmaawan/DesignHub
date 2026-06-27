import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import prisma from '../lib/prisma';
import { authMiddleware, AuthRequest } from '../middleware/auth';

const router = Router();

router.post('/', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const { projectId, accessLevel, expiresAt } = req.body;
    const shareLink = await prisma.shareLink.create({
      data: {
        projectId,
        token: uuidv4(),
        accessLevel: accessLevel || 'view',
        expiresAt: expiresAt ? new Date(expiresAt) : null,
      },
    });
    res.json(shareLink);
  } catch (error) {
    res.status(500).json({ error: 'Failed to create share link' });
  }
});

router.get('/:token', async (req: Request, res: Response) => {
  try {
    const shareLink = await prisma.shareLink.findUnique({
      where: { token: req.params.token },
      include: { project: { include: { pages: { include: { elements: true } } } } },
    });
    if (!shareLink) return res.status(404).json({ error: 'Share link not found' });
    if (shareLink.expiresAt && shareLink.expiresAt < new Date()) {
      return res.status(410).json({ error: 'Share link expired' });
    }
    res.json(shareLink);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch share link' });
  }
});

router.delete('/:id', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    await prisma.shareLink.delete({ where: { id: req.params.id } });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete share link' });
  }
});

export default router;
