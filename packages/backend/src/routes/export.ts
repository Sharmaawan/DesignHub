import { Router, Request, Response } from 'express';
import prisma from '../lib/prisma';
import { authMiddleware, AuthRequest } from '../middleware/auth';

const router = Router();

router.post('/', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const { format, projectId } = req.body;
    const exportRecord = await prisma.exportHistory.create({
      data: {
        projectId,
        exportType: format,
        fileUrl: `/exports/${projectId}.${format}`,
      },
    });
    res.json(exportRecord);
  } catch (error) {
    res.status(500).json({ error: 'Export failed' });
  }
});

router.get('/:id', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const record = await prisma.exportHistory.findUnique({ where: { id: req.params.id } });
    if (!record) return res.status(404).json({ error: 'Export not found' });
    res.json({ status: 'ready', url: record.fileUrl });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch export' });
  }
});

export default router;
