import { Router, Request, Response } from 'express';
import prisma from '../lib/prisma';
import { authMiddleware, AuthRequest } from '../middleware/auth';

const router = Router();

// ===== BRAND COLORS =====
router.get('/colors', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const colors = await prisma.brandColor.findMany({
      where: { userId: req.userId },
      orderBy: { createdAt: 'desc' },
    });
    res.json(colors);
  } catch {
    res.status(500).json({ error: 'Failed to fetch brand colors' });
  }
});

router.post('/colors', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const { hex, name } = req.body;
    if (!hex || !name) return res.status(400).json({ error: 'Hex and name are required' });
    const color = await prisma.brandColor.create({
      data: { hex, name, userId: req.userId! },
    });
    res.json(color);
  } catch {
    res.status(500).json({ error: 'Failed to create brand color' });
  }
});

router.delete('/colors/:id', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    await prisma.brandColor.delete({ where: { id: req.params.id } });
    res.json({ success: true });
  } catch {
    res.status(500).json({ error: 'Failed to delete brand color' });
  }
});

// ===== BRAND FONTS =====
router.get('/fonts', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const fonts = await prisma.brandFont.findMany({
      where: { userId: req.userId },
      orderBy: { createdAt: 'desc' },
    });
    res.json(fonts);
  } catch {
    res.status(500).json({ error: 'Failed to fetch brand fonts' });
  }
});

router.post('/fonts', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const { name, type, url } = req.body;
    if (!name || !type) return res.status(400).json({ error: 'Name and type are required' });
    const font = await prisma.brandFont.create({
      data: { name, type, url, userId: req.userId! },
    });
    res.json(font);
  } catch {
    res.status(500).json({ error: 'Failed to create brand font' });
  }
});

router.delete('/fonts/:id', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    await prisma.brandFont.delete({ where: { id: req.params.id } });
    res.json({ success: true });
  } catch {
    res.status(500).json({ error: 'Failed to delete brand font' });
  }
});

// ===== BRAND LOGOS =====
router.get('/logos', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const logos = await prisma.brandLogo.findMany({
      where: { userId: req.userId },
      orderBy: { createdAt: 'desc' },
    });
    res.json(logos);
  } catch {
    res.status(500).json({ error: 'Failed to fetch brand logos' });
  }
});

router.post('/logos', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const { name, url, isDefault } = req.body;
    if (!url) return res.status(400).json({ error: 'URL is required' });
    if (isDefault) {
      await prisma.brandLogo.updateMany({ where: { userId: req.userId }, data: { isDefault: false } });
    }
    const logo = await prisma.brandLogo.create({
      data: { name, url, isDefault: isDefault || false, userId: req.userId! },
    });
    res.json(logo);
  } catch {
    res.status(500).json({ error: 'Failed to create brand logo' });
  }
});

router.put('/logos/:id/default', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    await prisma.brandLogo.updateMany({ where: { userId: req.userId }, data: { isDefault: false } });
    await prisma.brandLogo.update({ where: { id: req.params.id }, data: { isDefault: true } });
    res.json({ success: true });
  } catch {
    res.status(500).json({ error: 'Failed to set default logo' });
  }
});

router.delete('/logos/:id', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    await prisma.brandLogo.delete({ where: { id: req.params.id } });
    res.json({ success: true });
  } catch {
    res.status(500).json({ error: 'Failed to delete brand logo' });
  }
});

// ===== BRAND ASSETS =====
router.get('/assets', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const assets = await prisma.userBrandAsset.findMany({
      where: { userId: req.userId },
      orderBy: { createdAt: 'desc' },
    });
    res.json(assets);
  } catch {
    res.status(500).json({ error: 'Failed to fetch brand assets' });
  }
});

router.post('/assets', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const { name, url, type, folder } = req.body;
    if (!url || !type) return res.status(400).json({ error: 'URL and type are required' });
    const asset = await prisma.userBrandAsset.create({
      data: { name, url, type, folder, userId: req.userId! },
    });
    res.json(asset);
  } catch {
    res.status(500).json({ error: 'Failed to create brand asset' });
  }
});

router.delete('/assets/:id', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    await prisma.userBrandAsset.delete({ where: { id: req.params.id } });
    res.json({ success: true });
  } catch {
    res.status(500).json({ error: 'Failed to delete brand asset' });
  }
});

// ===== BRAND TEMPLATES =====
router.get('/templates', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const templates = await prisma.brandTemplate.findMany({
      where: { userId: req.userId },
      include: { project: true },
      orderBy: { createdAt: 'desc' },
    });
    res.json(templates);
  } catch {
    res.status(500).json({ error: 'Failed to fetch brand templates' });
  }
});

router.post('/templates', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const { projectId, category } = req.body;
    if (!projectId) return res.status(400).json({ error: 'Project ID is required' });
    const template = await prisma.brandTemplate.create({
      data: { projectId, category, userId: req.userId! },
    });
    res.json(template);
  } catch {
    res.status(500).json({ error: 'Failed to create brand template' });
  }
});

router.delete('/templates/:id', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    await prisma.brandTemplate.delete({ where: { id: req.params.id } });
    res.json({ success: true });
  } catch {
    res.status(500).json({ error: 'Failed to delete brand template' });
  }
});

export default router;
