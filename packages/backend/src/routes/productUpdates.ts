import { Router, Response } from 'express';
import prisma from '../lib/prisma';
import { authMiddleware, AuthRequest } from '../middleware/auth';

const router = Router();

// List active product updates (public for all authenticated users)
router.get('/', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const updates = await prisma.productUpdate.findMany({
      where: { isActive: true },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });
    res.json(updates);
  } catch {
    res.status(500).json({ error: 'Failed to fetch updates' });
  }
});

// Admin: Create product update
router.post('/', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const { title, description, icon, badge, category } = req.body;
    if (!title || !description) return res.status(400).json({ error: 'Title and description required' });
    const update = await prisma.productUpdate.create({
      data: { title, description, icon: icon || '🚀', badge, category: category || 'product_update' },
    });
    res.json(update);
  } catch {
    res.status(500).json({ error: 'Failed to create update' });
  }
});

// Admin: Update product update
router.put('/:id', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const { title, description, icon, badge, category, isActive } = req.body;
    const update = await prisma.productUpdate.update({
      where: { id: req.params.id },
      data: { title, description, icon, badge, category, isActive },
    });
    res.json(update);
  } catch {
    res.status(500).json({ error: 'Failed to update' });
  }
});

// Admin: Delete product update
router.delete('/:id', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    await prisma.productUpdate.delete({ where: { id: req.params.id } });
    res.json({ success: true });
  } catch {
    res.status(500).json({ error: 'Failed to delete update' });
  }
});

export default router;
