import { Router, Request, Response } from 'express';
import prisma from '../lib/prisma';
import { authMiddleware, AuthRequest } from '../middleware/auth';

const router = Router();

router.get('/project/:projectId', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const collaborators = await prisma.collaborator.findMany({
      where: { projectId: req.params.projectId },
      include: { user: { select: { id: true, name: true, email: true, avatar: true } } },
    });
    res.json(collaborators);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch collaborators' });
  }
});

router.post('/', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const { projectId, email, permission } = req.body;
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) return res.status(404).json({ error: 'User not found' });
    const collaborator = await prisma.collaborator.create({
      data: { projectId, userId: user.id, permission: permission || 'view', invitedBy: req.userId },
      include: { user: { select: { id: true, name: true, email: true, avatar: true } } },
    });
    res.json(collaborator);
  } catch (error) {
    res.status(500).json({ error: 'Failed to add collaborator' });
  }
});

router.put('/:id', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const { permission } = req.body;
    const collaborator = await prisma.collaborator.update({
      where: { id: req.params.id },
      data: { permission },
    });
    res.json(collaborator);
  } catch (error) {
    res.status(500).json({ error: 'Failed to update collaborator' });
  }
});

router.delete('/:id', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    await prisma.collaborator.delete({ where: { id: req.params.id } });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to remove collaborator' });
  }
});

export default router;
