import { Router, Request, Response } from 'express';
import prisma from '../lib/prisma';
import { authMiddleware, AuthRequest } from '../middleware/auth';

const router = Router();

router.get('/', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const teams = await prisma.team.findMany({
      where: { members: { some: { userId: req.userId } } },
      include: { members: { include: { user: { select: { id: true, name: true, email: true, avatar: true } } } } },
      orderBy: { createdAt: 'desc' },
    });
    res.json(teams);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch teams' });
  }
});

router.post('/', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const { name } = req.body;
    const team = await prisma.team.create({
      data: {
        name,
        ownerId: req.userId!,
        members: { create: { userId: req.userId!, role: 'owner' } },
      },
      include: { members: true },
    });
    res.json(team);
  } catch (error) {
    res.status(500).json({ error: 'Failed to create team' });
  }
});

router.post('/:id/members', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const { email, role } = req.body;
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) return res.status(404).json({ error: 'User not found' });
    const member = await prisma.teamMember.create({
      data: { teamId: req.params.id, userId: user.id, role: role || 'member' },
    });
    res.json(member);
  } catch (error) {
    res.status(500).json({ error: 'Failed to add member' });
  }
});

router.delete('/:id/members/:memberId', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    await prisma.teamMember.delete({ where: { id: req.params.memberId } });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to remove member' });
  }
});

export default router;
