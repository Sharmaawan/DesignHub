import { Router, Response } from 'express';
import prisma from '../lib/prisma';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { removeBackground } from '../lib/backgroundRemovalModel';
import multer from 'multer';
import path from 'path';
import fs from 'fs';

const router = Router();

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    const dir = path.join(process.cwd(), 'uploads', 'backgrounds');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `bg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = ['image/png', 'image/jpeg', 'image/webp'];
    if (allowed.includes(file.mimetype)) cb(null, true);
    else cb(new Error('Only PNG, JPG, and WebP images are allowed'));
  },
});

// Upload and process background removal — runs a real ONNX segmentation model
// (see lib/backgroundRemovalModel.ts) entirely on this server, synchronously within
// the request. u2netp inference is a couple of seconds on CPU, which is fine at this
// scale without a job queue.
router.post('/remove', authMiddleware, upload.single('image'), async (req: AuthRequest, res: Response) => {
  let record: { id: string } | null = null;
  try {
    if (!req.file) return res.status(400).json({ error: 'No image uploaded' });

    const originalUrl = `/uploads/backgrounds/${req.file.filename}`;
    record = await prisma.backgroundRemoval.create({
      data: { userId: req.userId!, originalUrl, status: 'pending' },
    });

    const resultBuffer = await removeBackground(req.file.path);
    const resultFilename = `bg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}-result.png`;
    const resultPath = path.join(process.cwd(), 'uploads', 'backgrounds', resultFilename);
    fs.writeFileSync(resultPath, resultBuffer);
    const resultUrl = `/uploads/backgrounds/${resultFilename}`;

    const updated = await prisma.backgroundRemoval.update({
      where: { id: record.id },
      data: { status: 'completed', resultUrl },
    });

    res.json({
      id: updated.id,
      originalUrl: updated.originalUrl,
      resultUrl: updated.resultUrl,
      status: updated.status,
    });
  } catch (err: any) {
    console.error('[background-removal/remove] failed', err);
    if (record) {
      await prisma.backgroundRemoval.update({
        where: { id: record.id },
        data: { status: 'failed', error: err.message || 'Failed to process image' },
      }).catch(() => {});
    }
    res.status(500).json({ error: err.message || 'Failed to process image' });
  }
});

// List user's background removals
router.get('/', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const removals = await prisma.backgroundRemoval.findMany({
      where: { userId: req.userId },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });
    res.json(removals);
  } catch {
    res.status(500).json({ error: 'Failed to fetch removals' });
  }
});

// Delete background removal
router.delete('/:id', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const record = await prisma.backgroundRemoval.delete({ where: { id: req.params.id } });
    const filePath = path.join(process.cwd(), record.originalUrl);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    if (record.resultUrl) {
      const resultPath = path.join(process.cwd(), record.resultUrl);
      if (fs.existsSync(resultPath)) fs.unlinkSync(resultPath);
    }
    res.json({ success: true });
  } catch {
    res.status(500).json({ error: 'Failed to delete' });
  }
});

export default router;
