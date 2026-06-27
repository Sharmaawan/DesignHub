import { Router, Request, Response } from 'express';
import prisma from '../lib/prisma';
import { authMiddleware, AuthRequest } from '../middleware/auth';

const router = Router();

router.get('/', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    let prefs = await prisma.userPreferences.findUnique({ where: { userId: req.userId } });
    if (!prefs) {
      prefs = await prisma.userPreferences.create({ data: { userId: req.userId! } });
    }
    res.json(prefs);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch preferences' });
  }
});

router.put('/', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const { theme, language, autosaveInterval, editorPreferences } = req.body;
    const prefs = await prisma.userPreferences.upsert({
      where: { userId: req.userId! },
      update: { theme, language, autosaveInterval, editorPreferences },
      create: { userId: req.userId!, theme, language, autosaveInterval, editorPreferences },
    });
    res.json(prefs);
  } catch (error) {
    res.status(500).json({ error: 'Failed to update preferences' });
  }
});

export default router;
