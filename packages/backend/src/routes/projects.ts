import { Router, Request, Response } from 'express';
import prisma from '../lib/prisma';
import { authMiddleware, AuthRequest } from '../middleware/auth';

const router = Router();

router.get('/', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const projects = await prisma.project.findMany({
      where: { ownerId: req.userId },
      include: { pages: { include: { elements: true } }, favorites: true },
      orderBy: { updatedAt: 'desc' },
    });
    res.json(projects);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch projects' });
  }
});

router.get('/:id', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const project = await prisma.project.findUnique({
      where: { id: req.params.id },
      include: { pages: { include: { elements: true }, orderBy: { index: 'asc' } } },
    });
    if (!project) return res.status(404).json({ error: 'Project not found' });
    res.json(project);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch project' });
  }
});

router.post('/', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const { name, description, canvasData, status } = req.body;
    const project = await prisma.project.create({
      data: {
        name: name || 'Untitled Design',
        description,
        canvasData,
        status: status || 'draft',
        ownerId: req.userId!,
      },
    });
    res.json(project);
  } catch (error) {
    res.status(500).json({ error: 'Failed to create project' });
  }
});

router.put('/:id', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const { name, description, canvasData, status, thumbnail } = req.body;
    const project = await prisma.project.update({
      where: { id: req.params.id },
      data: { name, description, canvasData, status, thumbnail },
    });
    res.json(project);
  } catch (error) {
    res.status(500).json({ error: 'Failed to update project' });
  }
});

router.delete('/:id', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    await prisma.project.delete({ where: { id: req.params.id } });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete project' });
  }
});

router.post('/:id/duplicate', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const original = await prisma.project.findUnique({
      where: { id: req.params.id },
      include: { pages: { include: { elements: true } } },
    });
    if (!original) return res.status(404).json({ error: 'Project not found' });
    const duplicate = await prisma.project.create({
      data: {
        name: `${original.name} (Copy)`,
        description: original.description,
        canvasData: original.canvasData as any,
        status: original.status,
        ownerId: req.userId!,
        pages: {
          create: original.pages.map((page) => ({
            name: page.name,
            pageNumber: page.pageNumber,
            pageData: page.pageData,
            index: page.index,
            elements: {
              create: page.elements.map((el) => ({
                type: el.type,
                data: el.data,
                locked: el.locked,
                hidden: el.hidden,
                index: el.index,
              })),
            },
          })),
        },
      },
      include: { pages: true },
    });
    res.json(duplicate);
  } catch (error) {
    res.status(500).json({ error: 'Failed to duplicate project' });
  }
});

export default router;
