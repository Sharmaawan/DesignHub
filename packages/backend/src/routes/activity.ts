import { Router, Request, Response } from 'express';
import prisma from '../lib/prisma';
import { authMiddleware, AuthRequest } from '../middleware/auth';

const router = Router();

router.get('/', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const activities = await prisma.recentActivity.findMany({
      where: { userId: req.userId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    res.json(activities);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch activities' });
  }
});

router.post('/', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const { activityType, referenceId } = req.body;
    const activity = await prisma.recentActivity.create({
      data: { userId: req.userId!, activityType, referenceId },
    });
    res.json(activity);
  } catch (error) {
    res.status(500).json({ error: 'Failed to create activity' });
  }
});

export default router;
