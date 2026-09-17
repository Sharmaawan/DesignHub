import { Router, Request, Response } from 'express';
import prisma from '../lib/prisma';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { getProjectPermission } from '../lib/permissions';

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
    // Still deliberately unrestricted (see PUT/DELETE below for why) — but now also
    // tells the frontend what the viewer is allowed to DO with it, so e.g. an Editor
    // collaborator's autosave isn't wrongly treated as read-only just because they
    // don't own the project.
    const myPermission = await getProjectPermission(req.params.id, req.userId);
    res.json({ ...project, myPermission });
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

// PHASE 1 TEST: Hardcoded native elements (no OCR, no decomposition)
// Purpose: Prove the editor can handle native text elements before fixing OCR
router.post('/test/phase1-native-elements', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const project = await prisma.project.create({
      data: {
        name: '[PHASE 1 TEST] Native Elements Only',
        description: 'Hardcoded test: HAPPY, BIRTHDAY, text, images. No OCR, no decomposition.',
        canvasData: [{
          id: 'page-test-1',
          name: 'Page 1',
          width: 1024,
          height: 1536,
          backgroundColor: '#FFFFFF',
          elements: [
            {
              id: 'bg-image',
              type: 'image',
              name: 'Background',
              x: 0, y: 0, width: 1024, height: 1536,
              rotation: 0, opacity: 1, visible: true, locked: false, zIndex: 0,
              data: {
                type: 'image',
                src: 'https://images.unsplash.com/photo-1492684223066-81342ee5ff30?w=1024&h=1536&fit=crop',
                objectFit: 'cover', borderRadius: 0,
                brightness: 100, contrast: 100, saturation: 100, hue: 0, blur: 0,
                filters: [], cropX: 0, cropY: 0, cropWidth: 100, cropHeight: 100,
              },
            },
            {
              id: 'text-happy',
              type: 'text',
              name: 'HAPPY',
              x: 100, y: 200, width: 824, height: 120,
              rotation: 0, opacity: 1, visible: true, locked: false, zIndex: 10,
              data: {
                type: 'text',
                content: 'HAPPY',
                fontFamily: 'Arial', fontSize: 96, fontWeight: 700, fontStyle: 'normal',
                textDecoration: 'none', textAlign: 'center', color: '#FFFFFF',
                lineHeight: 1.2, letterSpacing: 0, textTransform: 'none',
              },
            },
            {
              id: 'text-birthday',
              type: 'text',
              name: 'BIRTHDAY',
              x: 100, y: 350, width: 824, height: 140,
              rotation: 0, opacity: 1, visible: true, locked: false, zIndex: 10,
              data: {
                type: 'text',
                content: 'BIRTHDAY',
                fontFamily: 'Arial', fontSize: 120, fontWeight: 700, fontStyle: 'normal',
                textDecoration: 'none', textAlign: 'center', color: '#FF6B9D',
                lineHeight: 1.2, letterSpacing: 2, textTransform: 'none',
              },
            },
            {
              id: 'text-dean',
              type: 'text',
              name: 'DEAN SOET',
              x: 150, y: 600, width: 724, height: 40,
              rotation: 0, opacity: 1, visible: true, locked: false, zIndex: 10,
              data: {
                type: 'text',
                content: 'DEAN SOET',
                fontFamily: 'Arial', fontSize: 32, fontWeight: 400, fontStyle: 'normal',
                textDecoration: 'none', textAlign: 'center', color: '#333333',
                lineHeight: 1.2, letterSpacing: 0, textTransform: 'none',
              },
            },
            {
              id: 'text-quote',
              type: 'text',
              name: 'Quote',
              x: 100, y: 700, width: 824, height: 100,
              rotation: 0, opacity: 1, visible: true, locked: false, zIndex: 10,
              data: {
                type: 'text',
                content: 'Make a wish and blow out the candles!',
                fontFamily: 'Arial', fontSize: 28, fontWeight: 400, fontStyle: 'italic',
                textDecoration: 'none', textAlign: 'center', color: '#666666',
                lineHeight: 1.5, letterSpacing: 0, textTransform: 'none',
              },
            },
            {
              id: 'text-footer',
              type: 'text',
              name: 'Footer',
              x: 100, y: 1400, width: 824, height: 50,
              rotation: 0, opacity: 1, visible: true, locked: false, zIndex: 10,
              data: {
                type: 'text',
                content: 'Celebrating you today!',
                fontFamily: 'Arial', fontSize: 24, fontWeight: 400, fontStyle: 'normal',
                textDecoration: 'none', textAlign: 'center', color: '#444444',
                lineHeight: 1.2, letterSpacing: 0, textTransform: 'none',
              },
            },
          ],
        }],
        status: 'draft',
        ownerId: req.userId!,
      },
    });
    res.json(project);
  } catch (error) {
    console.error('[Phase 1 Test] Failed:', error);
    res.status(500).json({ error: 'Failed to create test project' });
  }
});

router.put('/:id', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    // Previously unrestricted — any authenticated user could overwrite ANY project by
    // ID (e.g. an approver's project-review feature reads other people's projects by
    // ID, which made this gap directly reachable). GET stays open to any authenticated
    // user (needed for exactly that review flow); only mutation needs a permission
    // check — the owner, or a collaborator explicitly given "editor" access.
    const existing = await prisma.project.findUnique({ where: { id: req.params.id }, select: { ownerId: true } });
    if (!existing) return res.status(404).json({ error: 'Project not found' });
    const permission = await getProjectPermission(req.params.id, req.userId);
    if (permission !== 'owner' && permission !== 'editor') {
      return res.status(403).json({ error: 'You only have view access to this design' });
    }
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
    const existing = await prisma.project.findUnique({ where: { id: req.params.id }, select: { ownerId: true } });
    if (!existing) return res.status(404).json({ error: 'Project not found' });
    if (existing.ownerId !== req.userId) {
      return res.status(403).json({ error: 'Only the project owner can delete this design' });
    }
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
