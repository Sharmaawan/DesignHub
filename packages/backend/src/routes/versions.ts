import { Router, Request, Response } from 'express';
import prisma from '../lib/prisma';
import { authMiddleware, AuthRequest } from '../middleware/auth';

const router = Router();

router.get('/project/:projectId', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const versions = await prisma.version.findMany({
      where: { projectId: req.params.projectId },
      orderBy: { createdAt: 'desc' },
    });
    res.json(versions);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch versions' });
  }
});

router.post('/', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const { projectId, data, canvasSnapshot } = req.body;
    const lastVersion = await prisma.version.findFirst({
      where: { projectId },
      orderBy: { versionNumber: 'desc' },
    });
    const version = await prisma.version.create({
      data: {
        projectId,
        versionNumber: (lastVersion?.versionNumber || 0) + 1,
        data,
        canvasSnapshot,
        createdById: req.userId,
      },
    });
    res.json(version);
  } catch (error) {
    res.status(500).json({ error: 'Failed to create version' });
  }
});

export default router;
