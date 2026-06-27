import { Router, Request, Response } from 'express';
import prisma from '../lib/prisma';

const router = Router();

router.get('/', async (req: Request, res: Response) => {
  try {
    const { category, search } = req.query;
    const where: any = {};
    if (category && category !== 'All') where.category = category as string;
    if (search) where.name = { contains: search as string };
    const templates = await prisma.template.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });
    res.json(templates);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch templates' });
  }
});

router.get('/:id', async (req: Request, res: Response) => {
  try {
    const template = await prisma.template.findUnique({ where: { id: req.params.id } });
    if (!template) return res.status(404).json({ error: 'Template not found' });
    res.json(template);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch template' });
  }
});

router.post('/', async (req: Request, res: Response) => {
  try {
    const { name, category, subcategory, thumbnail, templateData, data, tags, isPremium } = req.body;
    const template = await prisma.template.create({
      data: { name, category, subcategory, thumbnail, templateData, data, tags: tags || [], isPremium: isPremium || false },
    });
    res.json(template);
  } catch (error) {
    res.status(500).json({ error: 'Failed to create template' });
  }
});

export default router;
