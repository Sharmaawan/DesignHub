import { Router, Request, Response } from 'express';
import multer from 'multer';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import prisma from '../lib/prisma';
import { authMiddleware, AuthRequest } from '../middleware/auth';

const router = Router();

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, 'uploads/'),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${uuidv4()}${ext}`);
  },
});

const ALLOWED_EXTS = new Set([
  // Images
  '.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp', '.bmp', '.tiff', '.ico',
  // Video
  '.mp4', '.webm', '.mov', '.avi', '.mkv',
  // Audio
  '.mp3', '.wav', '.ogg', '.aac', '.flac', '.m4a',
  // Documents
  '.pdf',
  '.doc', '.docx',
  '.ppt', '.pptx',
  '.xls', '.xlsx',
  '.csv', '.txt', '.rtf',
]);

const upload = multer({
  storage,
  limits: { fileSize: 100 * 1024 * 1024 }, // 100 MB
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (ALLOWED_EXTS.has(ext)) cb(null, true);
    else cb(new Error(`File type ${ext} not supported`));
  },
});

router.post('/', authMiddleware, upload.single('file'), async (req: AuthRequest, res: Response) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  try {
    const file = await prisma.upload.create({
      data: {
        fileName: req.file.filename,
        fileUrl: `/uploads/${req.file.filename}`,
        fileType: req.file.mimetype,
        url: `/uploads/${req.file.filename}`,
        size: req.file.size,
        ownerId: req.userId!,
      },
    });
    res.json(file);
  } catch (error) {
    res.status(500).json({ error: 'Failed to save upload' });
  }
});

router.post('/multiple', authMiddleware, upload.array('files', 20), async (req: AuthRequest, res: Response) => {
  if (!req.files) return res.status(400).json({ error: 'No files uploaded' });
  try {
    const files = await Promise.all(
      (req.files as Express.Multer.File[]).map((f) =>
        prisma.upload.create({
          data: {
            fileName: f.filename,
            fileUrl: `/uploads/${f.filename}`,
            fileType: f.mimetype,
            url: `/uploads/${f.filename}`,
            size: f.size,
            ownerId: req.userId!,
          },
        })
      )
    );
    res.json(files);
  } catch (error) {
    res.status(500).json({ error: 'Failed to save uploads' });
  }
});

router.get('/', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const files = await prisma.upload.findMany({
      where: { ownerId: req.userId },
      orderBy: { createdAt: 'desc' },
    });
    res.json(files);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch uploads' });
  }
});

router.delete('/:id', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    await prisma.upload.delete({ where: { id: req.params.id } });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete upload' });
  }
});

export default router;
