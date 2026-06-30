import { Router, Response } from 'express';
import prisma from '../lib/prisma';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { sendInviteEmail } from '../lib/email';
import crypto from 'crypto';

const router = Router();

// List teams for current user
router.get('/', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const teams = await prisma.team.findMany({
      where: { members: { some: { userId: req.userId } } },
      include: {
        members: { include: { user: { select: { id: true, name: true, email: true, avatar: true } } } },
        invites: { where: { status: 'pending' } },
      },
      orderBy: { createdAt: 'desc' },
    });
    res.json(teams);
  } catch {
    res.status(500).json({ error: 'Failed to fetch teams' });
  }
});

// Create team
router.post('/', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const { name } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Team name is required' });
    }
    if (!req.userId) {
      return res.status(401).json({ error: 'Not authenticated' });
    }
    const user = await prisma.user.findUnique({ where: { id: req.userId } });
    if (!user) {
      return res.status(401).json({ error: 'User not found. Please log in again.' });
    }
    const team = await prisma.team.create({
      data: {
        name: name.trim(),
        ownerId: req.userId,
        members: { create: { userId: req.userId, role: 'owner' } },
      },
      include: { members: true },
    });
    res.json(team);
  } catch (error: any) {
    console.error('Create team error:', error);
    res.status(500).json({ error: error.message || 'Failed to create team' });
  }
});

// Get team members
router.get('/:id/members', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const members = await prisma.teamMember.findMany({
      where: { teamId: req.params.id },
      include: { user: { select: { id: true, name: true, email: true, avatar: true } } },
    });
    res.json(members);
  } catch {
    res.status(500).json({ error: 'Failed to fetch members' });
  }
});

// Add member directly
router.post('/:id/members', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const { email, role } = req.body;
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) return res.status(404).json({ error: 'User not found' });
    const existing = await prisma.teamMember.findUnique({
      where: { teamId_userId: { teamId: req.params.id, userId: user.id } },
    });
    if (existing) return res.status(400).json({ error: 'User already a member' });
    const member = await prisma.teamMember.create({
      data: { teamId: req.params.id, userId: user.id, role: role || 'editor' },
      include: { user: { select: { id: true, name: true, email: true, avatar: true } } },
    });
    res.json(member);
  } catch {
    res.status(500).json({ error: 'Failed to add member' });
  }
});

// Remove member
router.delete('/:id/members/:memberId', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    await prisma.teamMember.delete({ where: { id: req.params.memberId } });
    res.json({ success: true });
  } catch {
    res.status(500).json({ error: 'Failed to remove member' });
  }
});

// Update member role
router.put('/:id/members/:memberId', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const { role } = req.body;
    const member = await prisma.teamMember.update({
      where: { id: req.params.memberId },
      data: { role },
    });
    res.json(member);
  } catch {
    res.status(500).json({ error: 'Failed to update member role' });
  }
});

// ===== INVITES =====

// List invites for team
router.get('/:id/invites', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const invites = await prisma.teamInvite.findMany({
      where: { teamId: req.params.id },
      include: { invitedBy: { select: { id: true, name: true, email: true } } },
      orderBy: { createdAt: 'desc' },
    });
    res.json(invites);
  } catch {
    res.status(500).json({ error: 'Failed to fetch invites' });
  }
});

// Send invite
router.post('/:id/invites', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const { email, role } = req.body;
    if (!email) return res.status(400).json({ error: 'Email is required' });

    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    const invite = await prisma.teamInvite.create({
      data: {
        teamId: req.params.id,
        email,
        role: role || 'editor',
        invitedById: req.userId!,
        token,
        expiresAt,
      },
    });

    // Get team and inviter info
    const team = await prisma.team.findUnique({ where: { id: req.params.id } });
    const inviter = await prisma.user.findUnique({ where: { id: req.userId! } });

    // Create in-app notification for invited user
    const invitedUser = await prisma.user.findUnique({ where: { email } });
    if (invitedUser) {
      await prisma.notification.create({
        data: {
          userId: invitedUser.id,
          type: 'team_invite',
          message: `You've been invited to join team "${team?.name}"`,
        },
      });
    }

    // Send email invitation — auto-use inviter's email as From address
    const inviteLink = `${process.env.FRONTEND_URL || 'http://localhost:5173'}/invite/${token}`;
    const inviterEmail = inviter?.email || '';

    const emailSent = await sendInviteEmail({
      to: email,
      inviterName: inviter?.name || inviterEmail || 'Someone',
      inviterEmail,
      teamName: team?.name || 'Team',
      inviteLink,
      role: role || 'editor',
    });

    res.json({ ...invite, emailSent });
  } catch (error: any) {
    console.error('Invite error:', error);
    res.status(500).json({ error: error.message || 'Failed to send invite' });
  }
});

// Accept invite
router.put('/invites/:inviteId/accept', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const invite = await prisma.teamInvite.findUnique({ where: { id: req.params.inviteId } });
    if (!invite) return res.status(404).json({ error: 'Invite not found' });
    if (invite.status !== 'pending') return res.status(400).json({ error: 'Invite already processed' });
    if (new Date() > invite.expiresAt) return res.status(400).json({ error: 'Invite expired' });

    await prisma.teamInvite.update({ where: { id: req.params.inviteId }, data: { status: 'accepted' } });

    const existingMember = await prisma.teamMember.findUnique({
      where: { teamId_userId: { teamId: invite.teamId, userId: req.userId! } },
    });
    if (!existingMember) {
      await prisma.teamMember.create({
        data: { teamId: invite.teamId, userId: req.userId!, role: invite.role },
      });
    }

    res.json({ success: true });
  } catch {
    res.status(500).json({ error: 'Failed to accept invite' });
  }
});

// Reject invite
router.put('/invites/:inviteId/reject', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    await prisma.teamInvite.update({
      where: { id: req.params.inviteId },
      data: { status: 'rejected' },
    });
    res.json({ success: true });
  } catch {
    res.status(500).json({ error: 'Failed to reject invite' });
  }
});

// Resend invite (generates new token)
router.put('/invites/:inviteId/resend', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const newToken = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const invite = await prisma.teamInvite.update({
      where: { id: req.params.inviteId },
      data: { token: newToken, expiresAt, status: 'pending' },
    });
    res.json(invite);
  } catch {
    res.status(500).json({ error: 'Failed to resend invite' });
  }
});

// Revoke invite
router.delete('/invites/:inviteId', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    await prisma.teamInvite.delete({ where: { id: req.params.inviteId } });
    res.json({ success: true });
  } catch {
    res.status(500).json({ error: 'Failed to revoke invite' });
  }
});

// Get invite by token (public)
router.get('/invite/:token', async (req, res) => {
  try {
    const invite = await prisma.teamInvite.findUnique({
      where: { token: req.params.token },
      include: { team: { select: { name: true } } },
    });
    if (!invite) return res.status(404).json({ error: 'Invalid invite' });
    if (invite.status !== 'pending') return res.status(400).json({ error: 'Invite already used' });
    if (new Date() > invite.expiresAt) return res.status(400).json({ error: 'Invite expired' });
    res.json({ email: invite.email, role: invite.role, teamName: invite.team.name });
  } catch {
    res.status(500).json({ error: 'Failed to fetch invite' });
  }
});

// List pending invites for current user (across all teams)
router.get('/user/invites', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.userId! } });
    if (!user) return res.status(404).json({ error: 'User not found' });

    const invites = await prisma.teamInvite.findMany({
      where: { email: user.email, status: 'pending', expiresAt: { gt: new Date() } },
      include: {
        team: { select: { id: true, name: true } },
        invitedBy: { select: { id: true, name: true, email: true, avatar: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    res.json(invites);
  } catch {
    res.status(500).json({ error: 'Failed to fetch invites' });
  }
});

export default router;
