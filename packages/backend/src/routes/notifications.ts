import { Router, Response } from 'express';
import prisma from '../lib/prisma';
import { authMiddleware, AuthRequest } from '../middleware/auth';

const router = Router();

// List notifications for current user
router.get('/', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const notifications = await prisma.notification.findMany({
      where: { userId: req.userId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    res.json(notifications);
  } catch {
    res.status(500).json({ error: 'Failed to fetch notifications' });
  }
});

// Get unread count
router.get('/unread-count', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const count = await prisma.notification.count({
      where: { userId: req.userId, isRead: false },
    });
    res.json({ count });
  } catch {
    res.status(500).json({ error: 'Failed to count notifications' });
  }
});

// Mark single notification as read
router.put('/:id/read', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const notification = await prisma.notification.update({
      where: { id: req.params.id },
      data: { isRead: true },
    });
    res.json(notification);
  } catch {
    res.status(500).json({ error: 'Failed to mark as read' });
  }
});

// Mark all as read
router.put('/read-all', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    await prisma.notification.updateMany({
      where: { userId: req.userId, isRead: false },
      data: { isRead: true },
    });
    res.json({ success: true });
  } catch {
    res.status(500).json({ error: 'Failed to mark all as read' });
  }
});

// Delete notification
router.delete('/:id', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    await prisma.notification.delete({ where: { id: req.params.id } });
    res.json({ success: true });
  } catch {
    res.status(500).json({ error: 'Failed to delete notification' });
  }
});

// Delete all notifications
router.delete('/', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    await prisma.notification.deleteMany({ where: { userId: req.userId } });
    res.json({ success: true });
  } catch {
    res.status(500).json({ error: 'Failed to delete all notifications' });
  }
});

export default router;
